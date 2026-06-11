// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Calendar, DollarSign, TrendingUp, MessageCircle, ExternalLink, QrCode } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';


interface Stats {
  totalClients: number;
  upcomingLessons: number;
  monthlyRevenue: number;
  activeRequests: number;
}

interface TelegramBotInfo {
  configured: boolean;
  username?: string | null;
  message?: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    upcomingLessons: 0,
    monthlyRevenue: 0,
    activeRequests: 0,
  });
  const [recentLessons, setRecentLessons] = useState<any[]>([]);
  const [botInfo, setBotInfo] = useState<TelegramBotInfo | null>(null);
  const [currentUser, setCurrentUser] = useState(user);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [clientsRes, lessonsRes, paymentsRes, requestsRes, botInfoRes, meRes] = await Promise.all([
        axios.get(`/api/clients`),
        axios.get(`/api/lessons`),
        axios.get(`/api/payments`),
        axios.get(`/api/slot-requests`),
        axios.get(`/api/telegram/bot-info`).catch(() => ({ data: null })),
        axios.get(`/api/auth/me`).catch(() => ({ data: user })),
      ]);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const upcoming = lessonsRes.data.filter((l: any) => 
        new Date(l.startTime) > now && l.status === 'PLANNED'
      );

      const monthPayments = paymentsRes.data.filter((p: any) => 
        new Date(p.dateTime) >= monthStart
      );

      const revenue = monthPayments.reduce((sum: number, p: any) => 
        sum + parseFloat(p.amount), 0
      );

      setStats({
        totalClients: clientsRes.data.length,
        upcomingLessons: upcoming.length,
        monthlyRevenue: revenue,
        activeRequests: requestsRes.data.filter((r: any) => ['PENDING', 'NEW', 'ACTIVE'].includes(r.status)).length,
      });

      setRecentLessons(
        lessonsRes.data
          .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          .slice(0, 5)
      );
      setBotInfo(botInfoRes.data);
      setCurrentUser(meRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Всего клиентов', value: stats.totalClients, icon: Users, color: 'blue' },
    { title: 'Предстоящие занятия', value: stats.upcomingLessons, icon: Calendar, color: 'green' },
    { title: 'Доход за месяц', value: `${stats.monthlyRevenue.toFixed(2)} ₽`, icon: DollarSign, color: 'purple' },
    { title: 'Активные запросы', value: stats.activeRequests, icon: TrendingUp, color: 'orange' },
  ];

  const isAdmin = currentUser?.role === 'ADMIN';

  const telegramConnectUrl = !isAdmin && botInfo?.username && currentUser?.id
    ? `https://t.me/${botInfo.username}?start=teacher_${currentUser.id}`
    : null;

  const telegramQrUrl = telegramConnectUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(telegramConnectUrl)}`
    : null;

  if (loading) {
    return <div className="text-center py-12">Загрузка...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 md:mb-8">Обзор</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
        {statCards.map((card) => (
          <div key={card.title} className="bg-white rounded-lg shadow p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">{card.title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
              </div>
              <div className={`bg-${card.color}-100 p-3 rounded-full`}>
                <card.icon className={`w-6 h-6 text-${card.color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6 md:mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-800">Telegram-бот напоминаний</h2>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isAdmin
                    ? 'bg-gray-100 text-gray-700'
                    : currentUser?.telegramChatId
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {isAdmin ? 'Не требуется' : currentUser?.telegramChatId ? 'Подключено' : 'Не подключено'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {isAdmin
                  ? 'У администратора нет собственных занятий и клиентов, поэтому персональная подписка на напоминания не используется.'
                  : 'Подключите Telegram, чтобы получать напоминания о занятиях за 24 часа и за 1 час.'}
              </p>

              {isAdmin ? (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  Статусы подключения преподавателей и клиентов доступны в разделах «Пользователи» и «Клиенты».
                </div>
              ) : telegramConnectUrl ? (
                <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-3">
                  <a
                    href={telegramConnectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center bg-sky-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-sky-700 font-semibold"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Открыть бота
                  </a>
                  <input
                    value={telegramConnectUrl}
                    readOnly
                    className="min-w-0 w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-gray-50"
                    onFocus={(event) => event.currentTarget.select()}
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

          <div className="flex items-center justify-center lg:justify-end">
            {isAdmin ? (
              <div className="w-40 h-40 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-center px-3">
                <QrCode className="w-8 h-8 mb-2" />
                <span className="text-xs">QR не требуется</span>
              </div>
            ) : telegramQrUrl ? (
              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <img
                  src={telegramQrUrl}
                  alt="QR-код подключения Telegram-бота"
                  className="w-40 h-40"
                />
              </div>
            ) : (
              <div className="w-40 h-40 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400">
                <QrCode className="w-8 h-8 mb-2" />
                <span className="text-xs">QR недоступен</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 md:p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Последние занятия</h2>
        </div>
        <div className="p-4 md:p-6">
          {recentLessons.length === 0 ? (
            <p className="text-gray-600">Нет занятий</p>
          ) : (
            <div className="space-y-4">
              {recentLessons.map((lesson) => (
                <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">
                      {lesson.client?.fullName || 'Неизвестный клиент'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(lesson.startTime).toLocaleString('ru-RU')} • {lesson.durationMin} мин
                    </p>
                  </div>
                  <span
                    className={`self-start sm:self-center px-3 py-1 rounded-full text-sm ${
                      lesson.status === 'DONE'
                        ? 'bg-green-100 text-green-800'
                        : lesson.status === 'PLANNED'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {lesson.status === 'DONE' ? 'Проведено' : lesson.status === 'PLANNED' ? 'Запланировано' : 'Отменено'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
