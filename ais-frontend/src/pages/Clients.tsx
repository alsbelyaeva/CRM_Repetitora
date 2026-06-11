import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Plus, Edit, Trash2, Star, MessageCircle, QrCode, RefreshCw, Copy, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppUser, getTeacherOptions, getUserLabel } from '../utils/admin';


interface Client {
  id: number;
  fullName: string;
  address?: string;
  telegramChatId?: string;
  phone?: string;
  email?: string;
  vip: boolean;
  createdAt: string;
  user?: {
    id: string;
    fullName?: string;
    email: string;
  };
}

interface TelegramBotInfo {
  configured: boolean;
  username?: string | null;
  message?: string | null;
}

export default function Clients() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [botInfo, setBotInfo] = useState<TelegramBotInfo | null>(null);
  const [copiedClientId, setCopiedClientId] = useState<number | null>(null);
  const [qrPreview, setQrPreview] = useState<{ clientName: string; url: string; connectUrl: string } | null>(null);
  const [selectedClientProfile, setSelectedClientProfile] = useState<Client | null>(null);

  useEffect(() => {
    fetchBotInfo();
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchClients();
  }, [selectedUserId]);

  const teacherQuery = selectedUserId ? `?userId=${selectedUserId}` : '';

  const fetchBotInfo = async () => {
    try {
      const response = await axios.get(`/api/telegram/bot-info`);
      setBotInfo(response.data);
    } catch (error) {
      console.error('Failed to fetch Telegram bot info:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`/api/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`/api/clients${teacherQuery}`);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этого клиента?')) return;

    try {
      await axios.delete(`/api/clients/${id}`);
      setClients(clients.filter((c) => c.id !== id));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка при удалении клиента');
    }
  };

  const filteredClients = clients.filter((client) =>
    client.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone?.includes(searchTerm)
  );

  const getTelegramConnectUrl = (clientId: number) => (
    botInfo?.username ? `https://t.me/${botInfo.username}?start=client_${clientId}` : null
  );

  const getTelegramQrUrl = (clientId: number, size = 96) => {
    const connectUrl = getTelegramConnectUrl(clientId);
    return connectUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(connectUrl)}`
      : null;
  };

  const copyTelegramLink = async (clientId: number) => {
    const connectUrl = getTelegramConnectUrl(clientId);
    if (!connectUrl) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(connectUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = connectUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedClientId(clientId);
      window.setTimeout(() => setCopiedClientId(current => (current === clientId ? null : current)), 2000);
    } catch (error) {
      console.error('Failed to copy Telegram link:', error);
      alert('Не удалось скопировать ссылку');
    }
  };

  const selectedClientTelegramConnectUrl = selectedClientProfile
    ? getTelegramConnectUrl(selectedClientProfile.id)
    : null;
  const selectedClientTelegramQrUrl = selectedClientProfile
    ? getTelegramQrUrl(selectedClientProfile.id, 360)
    : null;

  if (loading) {
    return <div className="text-center py-12">Загрузка...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Клиенты</h1>
        <Link
          to="/clients/new"
          className="flex items-center justify-center bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Добавить клиента
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 md:p-6 border-b">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Поиск по имени, email или телефону..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 md:py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isAdmin && (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-4 py-3 md:py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Все преподаватели</option>
                {getTeacherOptions(users).map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {getUserLabel(teacher)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="md:hidden divide-y divide-gray-200">
          {filteredClients.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-500">Клиенты не найдены</div>
          ) : (
            filteredClients.map((client) => {
              const telegramConnectUrl = getTelegramConnectUrl(client.id);
              const telegramQrUrl = getTelegramQrUrl(client.id);
              const telegramQrPreviewUrl = getTelegramQrUrl(client.id, 360);

              return (
                <div key={client.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 truncate">{client.fullName}</span>
                        {client.vip && <Star className="w-4 h-4 text-yellow-500 fill-current shrink-0" />}
                        {client.telegramChatId && (
                          <MessageCircle className="w-4 h-4 text-blue-500 shrink-0" aria-label="Telegram подключен" />
                        )}
                      </div>
                      {isAdmin && client.user && (
                        <div className="mt-1 text-xs text-gray-500">{getUserLabel(client.user as AppUser)}</div>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full shrink-0 ${
                      client.vip ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {client.vip ? 'VIP' : 'Обычный'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600">
                    <div><span className="text-gray-500">Email: </span>{client.email || '—'}</div>
                    <div><span className="text-gray-500">Телефон: </span>{client.phone || '—'}</div>
                    <div><span className="text-gray-500">Адрес: </span>{client.address || '—'}</div>
                    <div><span className="text-gray-500">Создан: </span>{new Date(client.createdAt).toLocaleDateString('ru-RU')}</div>
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${
                            client.telegramChatId
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            <MessageCircle className="w-3 h-3 mr-1" />
                            {client.telegramChatId ? 'Подключено' : 'Не подключено'}
                          </span>
                          <button
                            type="button"
                            onClick={fetchClients}
                            className="inline-flex items-center text-xs text-gray-500 hover:text-gray-800"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Проверить
                          </button>
                        </div>

                        {telegramConnectUrl ? (
                          <button
                            type="button"
                            onClick={() => copyTelegramLink(client.id)}
                            className="mt-2 inline-flex items-center text-sm font-medium text-sky-700 hover:text-sky-900"
                          >
                            {copiedClientId === client.id ? (
                              <>
                                <Check className="w-4 h-4 mr-1" />
                                Скопировано
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-1" />
                                Скопировать ссылку
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="mt-2 text-xs text-amber-700">
                            {botInfo?.message || (botInfo?.configured ? 'Username бота не получен' : 'TELEGRAM_BOT_TOKEN не задан')}
                          </div>
                        )}
                      </div>

                      {telegramQrUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (telegramQrPreviewUrl && telegramConnectUrl) {
                              setQrPreview({ clientName: client.fullName, url: telegramQrPreviewUrl, connectUrl: telegramConnectUrl });
                            }
                          }}
                          className="border border-gray-200 rounded bg-white p-1 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <img
                            src={telegramQrUrl}
                            alt={`QR-код подключения Telegram для клиента ${client.fullName}`}
                            className="w-20 h-20"
                          />
                        </button>
                      ) : (
                        <div className="w-20 h-20 border border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-400 shrink-0">
                          <QrCode className="w-5 h-5 mb-1" />
                          <span className="text-[10px]">QR</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      to={`/clients/${client.id}`}
                      className="inline-flex items-center justify-center px-3 py-3 rounded-lg border border-blue-200 text-blue-700 font-medium"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Изменить
                    </Link>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="inline-flex items-center justify-center px-3 py-3 rounded-lg border border-red-200 text-red-700 font-medium"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className={`${isAdmin ? 'w-[20%]' : 'w-[24%]'} px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  Имя
                </th>
                {isAdmin && (
                  <th className="w-[16%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Преподаватель
                  </th>
                )}
                <th className={`${isAdmin ? 'w-[23%]' : 'w-[30%]'} px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  Контакты
                </th>
                <th className="w-[12%] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className={`${isAdmin ? 'w-[15%]' : 'w-[18%]'} px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                  Telegram
                </th>
                <th className="w-[14%] px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                    Клиенты не найдены
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50 align-top">
                    <td className="px-6 py-4">
                      <div className="flex items-center min-w-0">
                        <span className="font-medium text-gray-900 truncate">{client.fullName}</span>
                        {client.vip && <Star className="w-4 h-4 ml-2 text-yellow-500 fill-current" />}
                        {client.telegramChatId && (
                          <MessageCircle className="w-4 h-4 ml-2 text-blue-500 shrink-0" aria-label="Telegram подключен" />
                        )}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-4 text-sm text-gray-600">
                        <div className="truncate">
                          {client.user ? getUserLabel(client.user as AppUser) : '—'}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <div className="space-y-1">
                        <div className="truncate">{client.email || 'Email не указан'}</div>
                        <div className="truncate">{client.phone || 'Телефон не указан'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        client.vip ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {client.vip ? 'VIP' : 'Обычный'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        client.telegramChatId
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        <MessageCircle className="w-3 h-3 mr-1" />
                        {client.telegramChatId ? 'Подключено' : 'Не подключено'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => setSelectedClientProfile(client)}
                        className="inline-flex min-w-[112px] items-center justify-center px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                      >
                        Подробнее
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClientProfile && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="truncate">{selectedClientProfile.fullName}</span>
                  {selectedClientProfile.vip && <Star className="w-5 h-5 text-yellow-500 fill-current shrink-0" />}
                </h2>
                <p className="text-sm text-gray-500 mt-1">Профиль клиента</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClientProfile(null)}
                className="p-1 text-gray-500 hover:text-gray-800"
                title="Закрыть"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Статус</div>
                  <span className={`mt-1 inline-flex px-2.5 py-1 text-sm rounded-full ${
                    selectedClientProfile.vip ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedClientProfile.vip ? 'VIP' : 'Обычный'}
                  </span>
                </div>
                {isAdmin && (
                  <div>
                    <div className="text-sm text-gray-500">Преподаватель</div>
                    <div className="font-medium text-gray-900">
                      {selectedClientProfile.user ? getUserLabel(selectedClientProfile.user as AppUser) : 'Не указан'}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-500">Email</div>
                  <div className="font-medium text-gray-900 break-words">{selectedClientProfile.email || 'Не указан'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Телефон</div>
                  <div className="font-medium text-gray-900">{selectedClientProfile.phone || 'Не указан'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Адрес занятий</div>
                  <div className="font-medium text-gray-900 break-words">{selectedClientProfile.address || 'Не указан'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Дата создания</div>
                  <div className="font-medium text-gray-900">
                    {new Date(selectedClientProfile.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">Telegram</h3>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    selectedClientProfile.telegramChatId
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    <MessageCircle className="w-3 h-3 mr-1" />
                    {selectedClientProfile.telegramChatId ? 'Подключено' : 'Не подключено'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Ссылка и QR-код нужны, чтобы клиент мог подключиться к боту для уведомлений о занятиях.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={fetchClients}
                    className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Проверить
                  </button>
                  <button
                    type="button"
                    onClick={() => copyTelegramLink(selectedClientProfile.id)}
                    disabled={!selectedClientTelegramConnectUrl}
                    className="inline-flex items-center px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {copiedClientId === selectedClientProfile.id ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Скопировать ссылку
                      </>
                    )}
                  </button>
                </div>

                {selectedClientTelegramQrUrl && selectedClientTelegramConnectUrl ? (
                  <button
                    type="button"
                    onClick={() => setQrPreview({
                      clientName: selectedClientProfile.fullName,
                      url: selectedClientTelegramQrUrl,
                      connectUrl: selectedClientTelegramConnectUrl
                    })}
                    className="mt-4 inline-flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <img
                      src={selectedClientTelegramQrUrl}
                      alt={`QR-код подключения Telegram для клиента ${selectedClientProfile.fullName}`}
                      className="w-28 h-28"
                    />
                    <span className="text-sm font-medium text-blue-700 text-left">Открыть QR-код крупно</span>
                  </button>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {botInfo?.message || (botInfo?.configured ? 'Username бота не получен' : 'TELEGRAM_BOT_TOKEN не задан')}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Link
                to={`/clients/${selectedClientProfile.id}`}
                className="inline-flex items-center justify-center px-4 py-3 sm:py-2 rounded-lg border border-blue-200 text-blue-700 font-medium hover:bg-blue-50"
              >
                <Edit className="w-4 h-4 mr-2" />
                Изменить
              </Link>
              <button
                type="button"
                onClick={() => {
                  handleDelete(selectedClientProfile.id);
                  setSelectedClientProfile(null);
                }}
                className="inline-flex items-center justify-center px-4 py-3 sm:py-2 rounded-lg border border-red-200 text-red-700 font-medium hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {qrPreview && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">QR для подключения клиента</h2>
                <p className="text-sm text-gray-600 mt-1">{qrPreview.clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="p-1 text-gray-500 hover:text-gray-800"
                title="Закрыть"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex justify-center">
              <img
                src={qrPreview.url}
                alt={`Крупный QR-код подключения Telegram для клиента ${qrPreview.clientName}`}
                className="w-80 h-80 border border-gray-200 rounded bg-white p-3"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const match = qrPreview.connectUrl.match(/client_(\d+)/);
                if (match) copyTelegramLink(Number(match[1]));
              }}
              className="mt-5 w-full inline-flex items-center justify-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold"
            >
              <Copy className="w-4 h-4 mr-2" />
              Скопировать ссылку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
