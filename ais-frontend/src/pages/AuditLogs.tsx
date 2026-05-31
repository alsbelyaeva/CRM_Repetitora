import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ClipboardList, RefreshCw, User as UserIcon } from 'lucide-react';
import { API_URL } from '../utils/apiBase';

interface User {
  id: string;
  email: string;
  fullName?: string | null;
  role: 'ADMIN' | 'TEACHER';
}

interface AuditLog {
  id: number;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  user?: User | null;
}

interface AuditLogsResponse {
  items: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Регистрация пользователя',
  'auth.password.change': 'Изменение пароля',
  'auth.passwordReset.request': 'Запрос восстановления пароля',
  'auth.passwordReset.complete': 'Сброс пароля',
  'client.create': 'Создание клиента',
  'client.update': 'Изменение клиента',
  'client.delete': 'Удаление клиента',
  'lesson.create': 'Создание занятия',
  'lesson.update': 'Изменение занятия',
  'lesson.cancel': 'Отмена занятия',
  'lesson.restore': 'Восстановление занятия',
  'lesson.status.update': 'Изменение статуса занятия',
  'lesson.recurringSeries.create': 'Создание регулярной серии',
  'scheduleEvent.create': 'Создание события',
  'scheduleEvent.update': 'Изменение события',
  'scheduleEvent.cancel': 'Отмена события',
  'scheduleEvent.restore': 'Восстановление события',
  'scheduleEvent.delete': 'Удаление события',
  'payment.create': 'Создание платежа',
  'payment.update': 'Изменение платежа',
  'payment.delete': 'Удаление платежа',
  'slotRequest.create': 'Создание запроса слотов',
  'slotRequest.update': 'Изменение запроса слотов',
  'slotRequest.cancel': 'Отмена запроса слотов',
  'slotRequest.restore': 'Восстановление запроса слотов',
  'slotRequest.acceptSlot': 'Принятие слота',
  'slotRequest.rejectSlot': 'Отклонение слота',
  'slotRequest.restoreSlot': 'Восстановление слота',
  'slotRequest.cancelSelection': 'Отмена выбора слота',
  'slotWeights.create': 'Создание настроек ранжирования',
  'slotWeights.update': 'Изменение настроек ранжирования',
  'slotWeights.delete': 'Удаление настроек ранжирования',
  'telegram.connect': 'Подключение Telegram',
};

const ENTITY_LABELS: Record<string, string> = {
  User: 'Пользователь',
  Client: 'Клиент',
  Lesson: 'Занятие',
  RecurringSeries: 'Регулярная серия',
  ScheduleEvent: 'Событие',
  Payment: 'Платеж',
  SlotRequest: 'Запрос слотов',
  SlotWeight: 'Настройки ранжирования',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUser(user?: User | null) {
  if (!user) return 'Системное действие';
  return user.fullName || user.email;
}

function stringifyDetails(details?: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) return '—';

  const entries = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 6)
    .map(([key, value]) => {
      const displayValue = Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);

      return `${key}: ${displayValue}`;
    });

  return entries.length ? entries.join('; ') : '—';
}

export default function AuditLogs() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const limit = 100;

  const selectedUserName = useMemo(() => {
    if (!selectedUserId) return 'Все пользователи';
    return formatUser(users.find(user => user.id === selectedUserId));
  }, [selectedUserId, users]);

  const fetchUsers = async () => {
    const response = await axios.get<User[]>(`${API_URL}/api/users`);
    setUsers(response.data);
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        limit: String(limit),
        offset: '0',
      });

      if (selectedUserId) {
        params.set('userId', selectedUserId);
      }

      const response = await axios.get<AuditLogsResponse>(`${API_URL}/api/audit-logs?${params.toString()}`);
      setLogs(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.response?.data?.error || 'Ошибка загрузки журнала действий');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers().catch((err) => {
      console.error('Failed to fetch users:', err);
      setError('Ошибка загрузки списка пользователей');
    });
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [selectedUserId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Журнал действий</h1>
          <p className="text-gray-600 mt-1">
            Значимые действия пользователей и системные события без секретных данных.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      <section className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-2">Пользователь</span>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="w-full min-h-[44px] pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Все пользователи</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {formatUser(user)} ({user.role === 'ADMIN' ? 'администратор' : 'преподаватель'})
                  </option>
                ))}
              </select>
            </div>
          </label>

          <div className="text-sm text-gray-600 md:text-right">
            Показано: {logs.length} из {total}
            <div className="text-xs text-gray-500">Фильтр: {selectedUserName}</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
        </div>
      )}

      <section className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="text-gray-600 mt-2">Загрузка журнала...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Записей пока нет</h3>
            <p className="mt-1 text-sm text-gray-500">После действий пользователей записи появятся здесь.</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-200">
              {logs.map((log) => (
                <article key={log.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {ACTION_LABELS[log.action] || log.action}
                      </div>
                      <div className="text-sm text-gray-500">{formatDate(log.createdAt)}</div>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                      {ENTITY_LABELS[log.entity] || log.entity}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="text-gray-500">Пользователь: </span>
                    {formatUser(log.user)}
                  </div>
                  {log.entityId && (
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">ID сущности: </span>
                      {log.entityId}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 break-words">{stringifyDetails(log.details)}</p>
                </article>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="w-40 px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                    <th className="w-48 px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
                    <th className="w-56 px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действие</th>
                    <th className="w-40 px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сущность</th>
                    <th className="w-28 px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 align-top">
                      <td className="px-5 py-4 text-sm text-gray-700">{formatDate(log.createdAt)}</td>
                      <td className="px-5 py-4 text-sm text-gray-900 break-words">{formatUser(log.user)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-900 break-words">
                        {ACTION_LABELS[log.action] || log.action}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">{ENTITY_LABELS[log.entity] || log.entity}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 break-all">{log.entityId || '—'}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 break-words">{stringifyDetails(log.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
