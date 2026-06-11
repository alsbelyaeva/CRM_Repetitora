import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { Users, Shield, ShieldOff, Mail, Calendar, MessageCircle, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';


interface User {
  id: string;
  email: string;
  emailVerifiedAt?: string | null;
  fullName?: string;
  role: 'ADMIN' | 'TEACHER';
  telegramChatId?: string | null;
  createdAt: string;
  clients?: Array<{
    id: number;
    fullName: string;
    email?: string;
    vip?: boolean;
  }>;
  _count?: {
    clients: number;
    lessons: number;
  };
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      alert('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminRole = async (userId: string, currentRole: string) => {
    if (userId === currentUser?.id) {
      alert('Нельзя изменить собственную роль администратора');
      return;
    }

    const newRole = currentRole === 'ADMIN' ? 'TEACHER' : 'ADMIN';
    const action = newRole === 'ADMIN' ? 'выдать' : 'забрать';
    
    if (!confirm(`Вы уверены, что хотите ${action} права администратора для этого пользователя?`)) {
      return;
    }

    try {
      await axios.put(`${API_URL}/api/users/${userId}`, { role: newRole });
      alert(`Права успешно ${newRole === 'ADMIN' ? 'выданы' : 'отозваны'}`);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      alert(error.response?.data?.error || 'Ошибка обновления прав');
    }
  };

  const getTelegramStatus = (user: User) => {
    if (user.role === 'ADMIN') {
      return {
        label: 'Не требуется',
        className: 'bg-gray-100 text-gray-700',
      };
    }

    return user.telegramChatId
      ? { label: 'Подключен', className: 'bg-emerald-100 text-emerald-800' }
      : { label: 'Не подключен', className: 'bg-gray-100 text-gray-700' };
  };

  const getEmailStatus = (user: User) => (
    user.emailVerifiedAt
      ? { label: 'Подтверждён', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 }
      : { label: 'Не подтверждён', className: 'bg-amber-100 text-amber-800', icon: AlertCircle }
  );

  const isCurrentUser = (userId: string) => userId === currentUser?.id;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Управление пользователями</h1>
          <p className="text-gray-600 mt-1">
            Всего пользователей: {users.length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-2">Загрузка...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="md:hidden divide-y divide-gray-200">
            {users.map((user) => (
              <div key={user.id} className="p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900">{user.fullName || 'Без имени'}</div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-600 break-all">
                      <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                      {user.email}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(() => {
                        const status = getEmailStatus(user);
                        const Icon = status.icon;
                        return (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                            <Icon className="w-3 h-3 mr-1" />
                            Email: {status.label}
                          </span>
                        );
                      })()}
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {user.role === 'ADMIN' ? (
                          <>
                            <Shield className="w-3 h-3 mr-1" />
                            Администратор
                          </>
                        ) : (
                          'Преподаватель'
                        )}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getTelegramStatus(user).className}`}>
                        <MessageCircle className="w-3 h-3 mr-1" />
                        Telegram: {getTelegramStatus(user).label}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                        {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                  </div>
                </div>

                {user.role === 'TEACHER' && (
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {user._count?.clients ?? user.clients?.length ?? 0} клиентов
                    </div>
                    {user.clients && user.clients.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user.clients.slice(0, 6).map((client) => (
                          <span
                            key={client.id}
                            className={`px-2 py-1 rounded-full text-xs ${
                              client.vip
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {client.fullName}
                          </span>
                        ))}
                        {user.clients.length > 6 && (
                          <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                            +{user.clients.length - 6}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 mt-1">Клиенты не назначены</div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className="flex w-full items-center justify-center px-3 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium"
                  >
                    Подробнее
                  </button>
                  <button
                    onClick={() => toggleAdminRole(user.id, user.role)}
                    disabled={isCurrentUser(user.id)}
                    className={`flex w-full items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isCurrentUser(user.id)
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : user.role === 'ADMIN'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    {isCurrentUser(user.id) ? (
                      <>
                        <Shield className="w-4 h-4" />
                        Ваш аккаунт
                      </>
                    ) : user.role === 'ADMIN' ? (
                      <>
                        <ShieldOff className="w-4 h-4" />
                        Забрать права
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        Дать права админа
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-[30%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="w-[34%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="w-[16%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="w-[20%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="ml-4 min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {user.fullName || 'Без имени'}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {user.role === 'TEACHER'
                              ? `${user._count?.clients ?? user.clients?.length ?? 0} клиентов`
                              : 'Системный доступ'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-sm text-gray-900 min-w-0">
                          <Mail className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <span className="break-all">{user.email}</span>
                        </div>
                        {(() => {
                          const status = getEmailStatus(user);
                          const Icon = status.icon;
                          return (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                              <Icon className="w-3 h-3 mr-1" />
                              {status.label}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {user.role === 'ADMIN' ? (
                          <>
                            <Shield className="w-3 h-3 mr-1" />
                            Администратор
                          </>
                        ) : (
                          'Преподаватель'
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium"
                        >
                          Подробнее
                        </button>
                        <button
                          onClick={() => toggleAdminRole(user.id, user.role)}
                          disabled={isCurrentUser(user.id)}
                          className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isCurrentUser(user.id)
                              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                              : user.role === 'ADMIN'
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          }`}
                        >
                          {isCurrentUser(user.id) ? (
                            <>
                              <Shield className="w-4 h-4" />
                              Ваш аккаунт
                            </>
                          ) : user.role === 'ADMIN' ? (
                            <>
                              <ShieldOff className="w-4 h-4" />
                              Забрать права
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" />
                              Дать права
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Пользователи не найдены</h3>
            </div>
          )}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 md:px-6 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">
                  {selectedUser.fullName || 'Без имени'}
                </h2>
                <p className="text-sm text-gray-500 mt-1 break-all">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1 text-gray-500 hover:text-gray-800 shrink-0"
                title="Закрыть"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Роль</p>
                  <span className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    selectedUser.role === 'ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {selectedUser.role === 'ADMIN' ? (
                      <>
                        <Shield className="w-3 h-3 mr-1" />
                        Администратор
                      </>
                    ) : (
                      'Преподаватель'
                    )}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Email</p>
                  {(() => {
                    const status = getEmailStatus(selectedUser);
                    const Icon = status.icon;
                    return (
                      <span className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {status.label}
                      </span>
                    );
                  })()}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Telegram</p>
                  <span className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getTelegramStatus(selectedUser).className}`}>
                    <MessageCircle className="w-3 h-3 mr-1" />
                    {getTelegramStatus(selectedUser).label}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Дата регистрации</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-medium text-gray-900">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    {new Date(selectedUser.createdAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900">Клиенты</h3>
                {selectedUser.role === 'TEACHER' ? (
                  selectedUser.clients && selectedUser.clients.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedUser.clients.map((client) => (
                        <span
                          key={client.id}
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            client.vip
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-white text-gray-700 border border-gray-200'
                          }`}
                          title={client.email || undefined}
                        >
                          {client.fullName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">Клиенты не назначены</p>
                  )
                ) : (
                  <p className="mt-2 text-sm text-gray-500">Для администратора список клиентов не применяется</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-500">
                  Управление ролью доступно только для чужих аккаунтов.
                </p>
                <button
                  onClick={() => toggleAdminRole(selectedUser.id, selectedUser.role)}
                  disabled={isCurrentUser(selectedUser.id)}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isCurrentUser(selectedUser.id)
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : selectedUser.role === 'ADMIN'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  {isCurrentUser(selectedUser.id) ? (
                    <>
                      <Shield className="w-4 h-4" />
                      Ваш аккаунт
                    </>
                  ) : selectedUser.role === 'ADMIN' ? (
                    <>
                      <ShieldOff className="w-4 h-4" />
                      Забрать права администратора
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Дать права администратора
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
