import { FormEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { AlertCircle, CalendarDays, CheckCircle2, Clock, ExternalLink, KeyRound, LayoutGrid, Mail, MessageCircle, Navigation, QrCode, RefreshCw, Save, SlidersHorizontal, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppUser, getTeacherOptions, getUserLabel } from '../utils/admin';
import { getPasswordIssues, getPasswordPolicyError } from '../utils/passwordPolicy';


interface TimePreference {
  period: 'morning' | 'day' | 'evening';
  enabled: boolean;
  weight: number;
}

interface Weights {
  wTime: number;
  wCompact: number;
  wWorkingDay: number;
  wPriority: number;
  wTravel: number;
  workingDays: number[];
  preferredTimes: {
    morning: TimePreference;
    day: TimePreference;
    evening: TimePreference;
  };
  minGapMinutes: number;
  maxGapMinutes: number;
  desiredBreakMinutes: number;
  maxTravelMinutes: number;
  gapImportance: number;
}

type WeightKey = 'wTime' | 'wCompact' | 'wWorkingDay' | 'wPriority' | 'wTravel';
type TimePeriodKey = keyof Weights['preferredTimes'];

const DEFAULT_WEIGHTS: Weights = {
  wTime: 0.3,
  wCompact: 0.3,
  wWorkingDay: 0.2,
  wPriority: 0.2,
  wTravel: 0.15,
  workingDays: [1, 2, 3, 4, 5],
  preferredTimes: {
    morning: { period: 'morning', enabled: false, weight: 0.5 },
    day: { period: 'day', enabled: true, weight: 0.7 },
    evening: { period: 'evening', enabled: false, weight: 0.5 },
  },
  minGapMinutes: 60,
  maxGapMinutes: 180,
  desiredBreakMinutes: 30,
  maxTravelMinutes: 60,
  gapImportance: 0.5,
};

const DAYS_OF_WEEK = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
];

const TIME_PERIODS: Record<TimePeriodKey, { label: string; range: string }> = {
  morning: { label: 'Утро', range: '6:00-12:00' },
  day: { label: 'День', range: '12:00-18:00' },
  evening: { label: 'Вечер', range: '18:00-23:00' },
};

const CRITERIA: Array<{
  key: WeightKey;
  title: string;
  description: string;
  low: string;
  high: string;
  icon: typeof Clock;
}> = [
  {
    key: 'wTime',
    title: 'Ближайшая дата',
    description: 'Поднимает слоты, которые можно провести раньше. Внутри этого критерия учитывается удобство времени дня.',
    low: 'Дата почти не влияет',
    high: 'Чем раньше, тем лучше',
    icon: Clock,
  },
  {
    key: 'wCompact',
    title: 'Компактность расписания',
    description: 'Помогает выбирать слоты рядом с существующими занятиями и заполнять окна.',
    low: 'Окна допустимы',
    high: 'Заполнять окна',
    icon: LayoutGrid,
  },
  {
    key: 'wWorkingDay',
    title: 'Рабочий день',
    description: 'Повышает оценку слотов в выбранные рабочие дни и снижает оценку выходных.',
    low: 'День недели неважен',
    high: 'Только рабочие дни',
    icon: CalendarDays,
  },
  {
    key: 'wPriority',
    title: 'VIP клиент',
    description: 'Дает больший приоритет клиентам, отмеченным как VIP.',
    low: 'VIP почти не влияет',
    high: 'VIP важнее остальных',
    icon: Star,
  },
  {
    key: 'wTravel',
    title: 'Время дороги',
    description: 'Учитывает дорогу между соседними занятиями через 2GIS и желаемый перерыв после поездки.',
    low: 'Дорога почти не влияет',
    high: 'Учитывать строго',
    icon: Navigation,
  },
];

const normalizeTimePreference = (
  key: TimePeriodKey,
  value: any,
): TimePreference => {
  const fallback = DEFAULT_WEIGHTS.preferredTimes[key];
  const weight = Number(value?.weight ?? value?.score ?? fallback.weight);

  return {
    period: key,
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
    weight: Number.isFinite(weight) ? weight : fallback.weight,
  };
};

const normalizePreferredTimes = (value: any): Weights['preferredTimes'] => {
  const source = value && typeof value === 'object' ? value : {};

  return {
    morning: normalizeTimePreference('morning', source.morning),
    day: normalizeTimePreference('day', source.day ?? source.afternoon),
    evening: normalizeTimePreference('evening', source.evening),
  };
};

const normalizeWorkingDays = (value: any): number[] => {
  if (!Array.isArray(value)) return DEFAULT_WEIGHTS.workingDays;

  const days = value
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);

  return days.length > 0 ? days : DEFAULT_WEIGHTS.workingDays;
};

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const passwordIssues = getPasswordIssues(passwordForm.newPassword);
  const [profileAddress, setProfileAddress] = useState('');
  const [savedProfileAddress, setSavedProfileAddress] = useState('');
  const [savedProfileTelegramChatId, setSavedProfileTelegramChatId] = useState('');
  const [botInfo, setBotInfo] = useState<{ configured: boolean; username?: string | null; message?: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [emailVerificationLoading, setEmailVerificationLoading] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState<string | null>(null);
  const [emailVerificationError, setEmailVerificationError] = useState<string | null>(null);

  const totalWeight = useMemo(() => {
    return weights.wTime + weights.wCompact + weights.wWorkingDay + weights.wPriority + weights.wTravel;
  }, [weights.wTime, weights.wCompact, weights.wWorkingDay, weights.wPriority, weights.wTravel]);

  const targetUserId = isAdmin ? selectedUserId : user?.id;
  const selectedTeacher = isAdmin
    ? users.find(item => item.id === selectedUserId)
    : undefined;
  const accountForStatus = isAdmin ? selectedTeacher : user;
  const emailVerified = Boolean(accountForStatus?.emailVerifiedAt || accountForStatus?.emailVerified);
  const canRequestEmailVerification = !isAdmin && Boolean(user?.email) && !emailVerified;

  useEffect(() => {
    const currentAddress = isAdmin
      ? selectedTeacher?.address || ''
      : user?.address || '';
    const currentTelegramChatId = isAdmin
      ? selectedTeacher?.telegramChatId || ''
      : user?.telegramChatId || '';

    setSavedProfileAddress(currentAddress);
    setProfileAddress(currentAddress);
    setSavedProfileTelegramChatId(currentTelegramChatId);
    setProfileMessage(null);
  }, [isAdmin, selectedTeacher?.address, selectedTeacher?.telegramChatId, user?.address, user?.telegramChatId]);

  useEffect(() => {
    axios.get(`${API_URL}/api/telegram/bot-info`)
      .then((response) => setBotInfo(response.data))
      .catch((error) => console.error('Ошибка загрузки данных Telegram-бота:', error));
  }, []);

  const fetchWeights = async () => {
    try {
      const userId = String(targetUserId);
      const response = await axios.get(`${API_URL}/api/slot-weights/${userId}`);

      if (response.data && typeof response.data === 'object') {
        setWeights({
          wTime: response.data.wTime ?? DEFAULT_WEIGHTS.wTime,
          wCompact: response.data.wCompact ?? DEFAULT_WEIGHTS.wCompact,
          wWorkingDay: response.data.wWorkingDay ?? DEFAULT_WEIGHTS.wWorkingDay,
          wPriority: response.data.wPriority ?? DEFAULT_WEIGHTS.wPriority,
          wTravel: response.data.wTravel ?? DEFAULT_WEIGHTS.wTravel,
          workingDays: normalizeWorkingDays(response.data.workingDays),
          preferredTimes: normalizePreferredTimes(response.data.preferredTimes),
          minGapMinutes: response.data.minGapMinutes || DEFAULT_WEIGHTS.minGapMinutes,
          maxGapMinutes: response.data.maxGapMinutes || DEFAULT_WEIGHTS.maxGapMinutes,
          desiredBreakMinutes: response.data.desiredBreakMinutes ?? DEFAULT_WEIGHTS.desiredBreakMinutes,
          maxTravelMinutes: response.data.maxTravelMinutes ?? DEFAULT_WEIGHTS.maxTravelMinutes,
          gapImportance: response.data.gapImportance || DEFAULT_WEIGHTS.gapImportance,
        });
      }
    } catch {
      setWeights(DEFAULT_WEIGHTS);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      axios.get(`${API_URL}/api/users`)
        .then((response) => {
          const teachers = getTeacherOptions(response.data);
          setUsers(response.data);
          if (!selectedUserId && teachers.length > 0) {
            setSelectedUserId(teachers[0].id);
          }
        })
        .catch((error) => console.error('Ошибка загрузки пользователей:', error));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (targetUserId) {
      fetchWeights();
    }
  }, [user, selectedUserId]);

  const handleSave = async () => {
    if (!targetUserId) {
      setError('Пользователь не авторизован');
      return;
    }

    if (weights.workingDays.length === 0) {
      setError('Выберите хотя бы один рабочий день');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userId = String(targetUserId);

      await axios.put(`${API_URL}/api/slot-weights/${userId}`, weights);
      alert('Настройки успешно сохранены');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error ||
        error.response?.data?.message ||
        'Ошибка сохранения';
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileAddressSave = async () => {
    if (!targetUserId) {
      setProfileMessage('Выберите пользователя');
      return;
    }

    setProfileLoading(true);
    setProfileMessage(null);

    try {
      const response = await axios.put(`${API_URL}/api/users/${targetUserId}`, {
        address: profileAddress,
      });

      if (isAdmin) {
        setUsers(prev => prev.map(item => (
          item.id === targetUserId
            ? { ...item, address: response.data.address }
            : item
        )));
      } else {
        await refreshUser();
      }

      setSavedProfileAddress(response.data.address || '');
      setProfileAddress(response.data.address || '');

      const message = 'Адрес сохранен';
      setProfileMessage(message);
      alert(message);
    } catch (error: any) {
      const message = error.response?.data?.error || 'Ошибка сохранения адреса';
      setProfileMessage(message);
      alert(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleEmailVerificationRequest = async () => {
    setEmailVerificationLoading(true);
    setEmailVerificationMessage(null);
    setEmailVerificationError(null);

    try {
      const response = await axios.post(`${API_URL}/api/auth/email-verification/request`);
      setEmailVerificationMessage(response.data?.message || 'Письмо для подтверждения email отправлено.');
      await refreshUser();
    } catch (error: any) {
      setEmailVerificationError(error.response?.data?.error || 'Письмо подтверждения email не отправлено');
    } finally {
      setEmailVerificationLoading(false);
    }
  };

  const refreshTelegramConnectionStatus = async () => {
    if (!targetUserId) {
      setProfileMessage('Выберите пользователя');
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/users/${targetUserId}`);
      const nextChatId = response.data.telegramChatId || '';

      if (isAdmin) {
        setUsers(prev => prev.map(item => (
          item.id === targetUserId ? { ...item, telegramChatId: nextChatId } : item
        )));
      }

      setSavedProfileTelegramChatId(nextChatId);
      setProfileMessage(nextChatId ? 'Telegram подключен' : 'Telegram пока не подключен');
    } catch (error: any) {
      setProfileMessage(error.response?.data?.error || 'Не удалось обновить статус Telegram');
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('Заполните текущий пароль и оба поля нового пароля');
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(passwordForm.newPassword);
    if (passwordPolicyError) {
      setPasswordError(passwordPolicyError);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Новые пароли не совпадают');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await axios.patch(`${API_URL}/api/auth/password`, passwordForm);
      const message = response.data?.message || 'Пароль успешно изменен';

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordSuccess(message);
      alert(message);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error ||
        error.response?.data?.message ||
        'Ошибка при смене пароля';
      setPasswordError(errorMessage);
      alert(errorMessage);
    } finally {
      setPasswordLoading(false);
    }
  };

  const updateCriterion = (key: WeightKey, value: number) => {
    setWeights(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleWorkingDay = (day: number) => {
    setWeights(prev => {
      const isSelected = prev.workingDays.includes(day);
      return {
        ...prev,
        workingDays: isSelected
          ? prev.workingDays.filter(d => d !== day)
          : [...prev.workingDays, day].sort(),
      };
    });
  };

  const updateTimePreference = (
    key: TimePeriodKey,
    patch: Partial<TimePreference>
  ) => {
    setWeights(prev => ({
      ...prev,
      preferredTimes: {
        ...prev.preferredTimes,
        [key]: {
          ...prev.preferredTimes[key],
          ...patch,
        },
      },
    }));
  };

  const formatGapTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} мин`;
    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
    }
    return `${minutes / 1440} дн`;
  };

  const normalizedPercent = (value: number) => {
    if (totalWeight <= 0) return 0;
    return Math.round((value / totalWeight) * 100);
  };

  const telegramConnectUrl = !isAdmin && botInfo?.username && targetUserId
    ? `https://t.me/${botInfo.username}?start=teacher_${targetUserId}`
    : null;

  const telegramQrUrl = telegramConnectUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(telegramConnectUrl)}`
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Настройки ранжирования</h1>
          <p className="text-sm text-gray-600 mt-2">
            Система сравнивает предложенные клиентом слоты и сортирует их по итоговому баллу.
          </p>
        </div>
      </div>

      <div className="max-w-5xl w-full space-y-4 md:space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {isAdmin && (
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-semibold mb-2">Настройки преподавателя</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full md:w-80 px-4 py-2 border rounded-lg bg-white"
            >
              {getTeacherOptions(users).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {getUserLabel(teacher)}
                </option>
              ))}
            </select>
          </div>
        )}

        {profileMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">{profileMessage}</p>
          </div>
        )}

        {emailVerificationMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm text-emerald-800">{emailVerificationMessage}</p>
          </div>
        )}

        {emailVerificationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{emailVerificationError}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-800">Email аккаунта</h2>
                  <p className="text-sm text-gray-600 mt-1 break-all">
                    {accountForStatus?.email || 'Email не найден'}
                  </p>
                </div>
                <span className={`inline-flex items-center w-fit px-3 py-1.5 rounded-full text-sm font-semibold ${
                  emailVerified
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {emailVerified ? (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mr-2" />
                  )}
                  {emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
                </span>
              </div>
              {!emailVerified && (
                <p className="text-sm text-gray-600 mt-3">
                  {isAdmin
                    ? 'Подтверждение выполняет владелец аккаунта через свой личный кабинет.'
                    : 'Нажмите кнопку, чтобы получить письмо со ссылкой подтверждения.'}
                </p>
              )}
              {canRequestEmailVerification && (
                <button
                  type="button"
                  onClick={handleEmailVerificationRequest}
                  disabled={emailVerificationLoading}
                  className="mt-4 inline-flex items-center justify-center w-full sm:w-auto bg-indigo-600 text-white px-5 py-3 sm:py-2.5 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {emailVerificationLoading ? 'Отправка...' : 'Отправить письмо подтверждения'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Адрес преподавателя</h2>
              <p className="text-sm text-gray-600 mt-1">
                Используется как стартовая точка для расчета дороги к первому занятию.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-sm font-semibold mb-2">
                {isAdmin ? 'Адрес выбранного преподавателя' : 'Ваш адрес'}
              </label>
              <div className="mb-2 text-sm text-gray-600">
                Сейчас сохранено: <span className="font-medium text-gray-800">{savedProfileAddress || 'адрес не задан'}</span>
              </div>
              <input
                type="text"
                value={profileAddress}
                onChange={(e) => setProfileAddress(e.target.value)}
                className="w-full px-4 py-3 md:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Город, улица, дом"
                disabled={!targetUserId}
              />
            </div>
            <button
              type="button"
              onClick={handleProfileAddressSave}
              disabled={profileLoading || !targetUserId}
              className="flex items-center justify-center w-full md:w-auto bg-cyan-600 text-white px-5 py-3 md:py-2.5 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              <Save className="w-4 h-4 mr-2" />
              {profileLoading ? 'Сохранение...' : 'Сохранить адрес'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6 overflow-hidden">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-800">Telegram преподавателя</h2>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    savedProfileTelegramChatId
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {savedProfileTelegramChatId ? 'Подключено' : 'Не подключено'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {isAdmin
                    ? 'Администратор видит статус подключения выбранного преподавателя. Подключение выполняет сам преподаватель через свой личный кабинет.'
                    : 'Откройте бота по персональной ссылке или QR-коду и нажмите Start. Chat ID сохранится автоматически.'}
                </p>

                {isAdmin ? (
                  <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 max-w-full">
                    <button
                      type="button"
                      onClick={refreshTelegramConnectionStatus}
                      className="inline-flex items-center justify-center w-full sm:w-auto border border-gray-300 text-gray-700 px-4 py-3 sm:py-2 rounded-lg hover:bg-gray-50 font-semibold"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Проверить подключение
                    </button>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                      Ссылка и QR-код не показываются администратору, чтобы не привязать его Telegram к чужому расписанию.
                    </div>
                  </div>
                ) : telegramConnectUrl ? (
                  <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => window.open(telegramConnectUrl, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center justify-center w-full sm:w-auto bg-sky-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-sky-700 font-semibold"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Открыть Telegram-бота
                    </button>
                    <button
                      type="button"
                      onClick={refreshTelegramConnectionStatus}
                      className="inline-flex items-center justify-center w-full sm:w-auto border border-gray-300 text-gray-700 px-4 py-3 sm:py-2 rounded-lg hover:bg-gray-50 font-semibold"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Проверить подключение
                    </button>
                    <input
                      value={telegramConnectUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-w-0 w-full xl:max-w-[28rem] px-3 py-3 sm:py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-gray-50"
                    />
                  </div>
                ) : (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    {botInfo?.message || (botInfo?.configured
                      ? 'Бот настроен, но username пока не получен. Проверьте токен и перезапустите backend.'
                      : 'TELEGRAM_BOT_TOKEN не задан. Добавьте токен в .env и перезапустите backend.')}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center xl:justify-end shrink-0">
              {isAdmin ? (
                <div className="w-36 h-36 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-center px-3">
                  <QrCode className="w-8 h-8 mb-2" />
                  <span className="text-xs">QR не требуется</span>
                </div>
              ) : telegramQrUrl ? (
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <img
                    src={telegramQrUrl}
                    alt="QR-код подключения Telegram-бота"
                    className="w-36 h-36"
                  />
                </div>
              ) : (
                <div className="w-36 h-36 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400">
                  <QrCode className="w-8 h-8 mb-2" />
                  <span className="text-xs">QR недоступен</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Пароль аккаунта</h2>
              <p className="text-sm text-gray-600 mt-1">
                Для смены пароля подтвердите текущий пароль и дважды введите новый.
              </p>
            </div>
          </div>

          {passwordError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-sm text-red-800">{passwordError}</p>
            </div>
          )}

          {passwordSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mb-4">
              <p className="text-sm text-emerald-800">{passwordSuccess}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Текущий пароль</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                autoComplete="current-password"
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Новый пароль</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                autoComplete="new-password"
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                {passwordForm.newPassword && passwordIssues.length === 0 ? (
                  <p className="text-emerald-700">Требования выполнены</p>
                ) : (
                  <>
                    <p className="font-medium">Новый пароль должен содержать:</p>
                    <ul className="list-disc pl-5">
                      {(passwordForm.newPassword ? passwordIssues : [
                        'минимум 8 символов',
                        'цифру',
                        'строчную латинскую букву a-z',
                        'заглавную латинскую букву A-Z',
                        'без простых шаблонов вроде 12345678 или qwertyui',
                      ]).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Повторите новый пароль</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                autoComplete="new-password"
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="mt-5 flex items-center justify-center w-full sm:w-auto bg-emerald-600 text-white px-5 py-3 md:py-2.5 rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {passwordLoading ? 'Смена пароля...' : 'Изменить пароль'}
          </button>
        </form>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">Вес критериев</h2>
              </div>
              <p className="text-sm text-gray-600">
                Чем выше вес, тем сильнее критерий влияет на итоговый выбор. Сумма нормализуется автоматически.
              </p>
            </div>
            <div className="text-left sm:text-right text-sm text-gray-600 sm:whitespace-nowrap">
              <div className="font-semibold text-gray-800">Итоговая формула</div>
              <div>score = сумма критериев x вес</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {CRITERIA.map((criterion) => {
              const Icon = criterion.icon;
              const value = weights[criterion.key];

              return (
                <div key={criterion.key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-gray-800">{criterion.title}</h3>
                        <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                          {normalizedPercent(value)}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{criterion.description}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={value}
                      onChange={(e) => updateCriterion(criterion.key, Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{criterion.low}</span>
                      <span>{criterion.high}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Рабочие дни</h2>
          <p className="text-sm text-gray-600 mb-4">
            Слоты в эти дни получают высокий балл по критерию рабочего дня.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day) => {
              const selected = weights.workingDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWorkingDay(day.value)}
                  className={`h-11 rounded-lg border font-semibold transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Удобство времени дня</h2>
          <p className="text-sm text-gray-600 mb-4">
            Это уточняет критерий ближайшей даты: например, можно немного повысить вечерние слоты или понизить утренние.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(TIME_PERIODS).map(([key, period]) => {
              const pref = weights.preferredTimes[key as TimePeriodKey];

              return (
                <div key={key} className="border border-gray-200 rounded-lg p-4">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span>
                      <span className="block font-semibold text-gray-800">{period.label}</span>
                      <span className="block text-xs text-gray-500">{period.range}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={pref.enabled}
                      onChange={(e) => updateTimePreference(key as TimePeriodKey, { enabled: e.target.checked })}
                      className="w-5 h-5"
                    />
                  </label>

                  <div className={pref.enabled ? 'mt-4' : 'mt-4 opacity-50'}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600">Оценка удобства</span>
                      <span className="font-semibold text-gray-800">{pref.weight.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={pref.weight}
                      disabled={!pref.enabled}
                      onChange={(e) => updateTimePreference(key as TimePeriodKey, { weight: Number(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Ниже</span>
                      <span>Выше</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Окна между занятиями</h2>
          <p className="text-sm text-gray-600 mb-4">
            Эти значения помогают критерию компактности понять, какой промежуток считать удачным.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Минимальный комфортный промежуток: {formatGapTime(weights.minGapMinutes)}
              </label>
              <select
                value={weights.minGapMinutes}
                onChange={(e) => setWeights({ ...weights, minGapMinutes: Number(e.target.value) })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white"
              >
                <option value="0">Без промежутка</option>
                <option value="30">30 минут</option>
                <option value="60">1 час</option>
                <option value="90">1.5 часа</option>
                <option value="120">2 часа</option>
                <option value="180">3 часа</option>
                <option value="240">4 часа</option>
                <option value="360">6 часов</option>
                <option value="480">8 часов</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Желаемый перерыв после дороги: {formatGapTime(weights.desiredBreakMinutes)}
              </label>
              <select
                value={weights.desiredBreakMinutes}
                onChange={(e) => setWeights({ ...weights, desiredBreakMinutes: Number(e.target.value) })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white"
              >
                <option value="0">Не нужен</option>
                <option value="15">15 минут</option>
                <option value="30">30 минут</option>
                <option value="45">45 минут</option>
                <option value="60">1 час</option>
                <option value="90">1.5 часа</option>
                <option value="120">2 часа</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Максимальный комфортный промежуток: {formatGapTime(weights.maxGapMinutes)}
              </label>
              <select
                value={weights.maxGapMinutes}
                onChange={(e) => setWeights({ ...weights, maxGapMinutes: Number(e.target.value) })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white"
              >
                <option value="60">1 час</option>
                <option value="90">1.5 часа</option>
                <option value="120">2 часа</option>
                <option value="180">3 часа</option>
                <option value="240">4 часа</option>
                <option value="360">6 часов</option>
                <option value="480">8 часов</option>
                <option value="720">12 часов</option>
                <option value="1440">24 часа</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Желаемый максимум дороги: {weights.maxTravelMinutes === 0 ? 'не ограничивать' : formatGapTime(weights.maxTravelMinutes)}
              </label>
              <select
                value={weights.maxTravelMinutes}
                onChange={(e) => setWeights({ ...weights, maxTravelMinutes: Number(e.target.value) })}
                className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white"
              >
                <option value="0">Не ограничивать</option>
                <option value="15">15 минут</option>
                <option value="30">30 минут</option>
                <option value="45">45 минут</option>
                <option value="60">1 час</option>
                <option value="90">1.5 часа</option>
                <option value="120">2 часа</option>
                <option value="180">3 часа</option>
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading || !targetUserId}
          className="w-full flex items-center justify-center bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg shadow"
        >
          <Save className="w-5 h-5 mr-2" />
          {loading ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
