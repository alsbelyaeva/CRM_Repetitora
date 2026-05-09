import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { Users, Shield, ShieldOff, Mail, Calendar } from 'lucide-react';


interface User {
  id: string;
  email: string;
  fullName?: string;
  role: 'ADMIN' | 'TEACHER';
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

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
    const newRole = currentRole === 'ADMIN' ? 'TEACHER' : 'ADMIN';
    const action = newRole === 'ADMIN' ? 'выдать' : 'забрать';
    
    if (!confirm(`Вы уверены, что хотите ${action} права администратора для этого пользователя?`)) {
      return;
    }

    try {
      await axios.put(`${API_URL}/api/users/${userId}`, { role: newRole });
      alert(`Права успешно ${newRole === 'ADMIN' ? 'выданы' : 'отозваны'}`);
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      alert(error.response?.data?.error || 'Ошибка обновления прав');
    }
  };

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

                <button
                  onClick={() => toggleAdminRole(user.id, user.role)}
                  className={`flex w-full items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    user.role === 'ADMIN'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  {user.role === 'ADMIN' ? (
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
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Клиенты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата регистрации
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.fullName || 'Без имени'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {user.email}
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
                      {user.role === 'TEACHER' ? (
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {user._count?.clients ?? user.clients?.length ?? 0} клиентов
                          </div>
                          {user.clients && user.clients.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1 max-w-md">
                              {user.clients.slice(0, 6).map((client) => (
                                <span
                                  key={client.id}
                                  className={`px-2 py-0.5 rounded-full text-xs ${
                                    client.vip
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                  title={client.email || undefined}
                                >
                                  {client.fullName}
                                </span>
                              ))}
                              {user.clients.length > 6 && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                                  +{user.clients.length - 6}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 mt-1">Клиенты не назначены</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleAdminRole(user.id, user.role)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          user.role === 'ADMIN'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        }`}
                      >
                        {user.role === 'ADMIN' ? (
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
    </div>
  );
}