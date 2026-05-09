import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { Search, Users, Mail, Phone, Calendar, DollarSign, X } from 'lucide-react';


interface Client {
  id: number;
  fullName: string;
  email?: string;
  phone?: string;
  vip: boolean;
  notes?: string;
  createdAt: string;
  user: {
    fullName: string;
    email: string;
  };
  _count?: {
    lessons: number;
    payments: number;
  };
}

interface ClientDetails extends Client {
  lessons: Array<{
    id: number;
    startTime: string;
    durationMin: number;
    type: string;
    status: string;
    notes?: string;
  }>;
  payments: Array<{
    id: number;
    amount: string;
    method: string;
    dateTime: string;
    note?: string;
  }>;
}

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientDetails | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    filterClients();
  }, [searchTerm, clients]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/admin/clients`);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      alert('Ошибка загрузки клиентов');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientDetails = async (clientId: number) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/admin/clients/${clientId}`);
      setSelectedClient(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Failed to fetch client details:', error);
      alert('Ошибка загрузки деталей клиента');
    } finally {
      setLoading(false);
    }
  };

  const filterClients = () => {
    if (!searchTerm) {
      setFilteredClients(clients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = clients.filter(
      (client) =>
        client.fullName.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.includes(term) ||
        client.user.fullName.toLowerCase().includes(term)
    );
    setFilteredClients(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'text-green-600';
      case 'CANCELLED':
        return 'text-red-600';
      default:
        return 'text-blue-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'Проведено';
      case 'CANCELLED':
        return 'Отменено';
      default:
        return 'Запланировано';
    }
  };

  const totalPayments = selectedClient?.payments.reduce(
    (sum, p) => sum + parseFloat(p.amount),
    0
  ) || 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Все клиенты</h1>
          <p className="text-gray-600 mt-1">
            Всего клиентов: {clients.length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Поиск по имени, email, телефону или преподавателю..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
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
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => fetchClientDetails(client.id)}
                className="w-full p-4 text-left hover:bg-gray-50"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{client.fullName}</span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        client.vip ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {client.vip ? 'VIP клиент' : 'Активен'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700">
                      {client.email && (
                        <div className="flex items-center gap-2 break-all">
                          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                          {client.email}
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          {client.phone}
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Преподаватель: </span>
                        <span className="font-medium">{client.user.fullName}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                        <Calendar className="w-3 h-3" />
                        {client._count?.lessons || 0} занятий
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                        <DollarSign className="w-3 h-3" />
                        {client._count?.payments || 0} платежей
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                        {new Date(client.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Клиент
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Преподаватель
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Занятия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Платежи
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата создания
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => fetchClientDetails(client.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {client.fullName}
                          </div>
                          {client.vip && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              VIP
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {client.email && (
                          <div className="flex items-center gap-1 mb-1">
                            <Mail className="w-4 h-4 text-gray-400" />
                            {client.email}
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {client.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{client.user.fullName}</div>
                      <div className="text-sm text-gray-500">{client.user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        client.vip ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {client.vip ? 'VIP клиент' : 'Активен'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900">
                        <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                        {client._count?.lessons || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-900">
                        <DollarSign className="w-4 h-4 mr-1 text-gray-400" />
                        {client._count?.payments || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(client.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredClients.length === 0 && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Клиенты не найдены</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? 'Попробуйте изменить параметры поиска' : 'В системе пока нет клиентов'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Модальное окно деталей клиента */}
      {showDetailsModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 md:px-6 py-4 flex justify-between items-center gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">{selectedClient.fullName}</h2>
                {selectedClient.vip && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mt-1">
                    VIP клиент
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 md:p-6">
              {/* Информация о клиенте */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-semibold mb-3">Контактная информация</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium">{selectedClient.email || 'Не указан'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Телефон</p>
                    <p className="font-medium">{selectedClient.phone || 'Не указан'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Преподаватель</p>
                    <p className="font-medium">{selectedClient.user.fullName}</p>
                    <p className="text-sm text-gray-500">{selectedClient.user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Дата регистрации</p>
                    <p className="font-medium">
                      {new Date(selectedClient.createdAt).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                </div>
                {selectedClient.notes && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">Примечания</p>
                    <p className="text-sm mt-1">{selectedClient.notes}</p>
                  </div>
                )}
              </div>

              {/* Статистика */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Всего занятий</p>
                      <p className="text-2xl font-bold text-blue-700 mt-1">
                        {selectedClient.lessons.length}
                      </p>
                    </div>
                    <Calendar className="w-8 h-8 text-blue-400" />
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 font-medium">Проведено</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">
                        {selectedClient.lessons.filter((l) => l.status === 'DONE').length}
                      </p>
                    </div>
                    <Calendar className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-600 font-medium">Доход</p>
                      <p className="text-2xl font-bold text-purple-700 mt-1">
                        {totalPayments.toFixed(2)} ₽
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-purple-400" />
                  </div>
                </div>
              </div>

              {/* Занятия */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">История занятий</h3>
                {selectedClient.lessons.length > 0 ? (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Время</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Тип</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Длительность</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Статус</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedClient.lessons
                            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                            .slice(0, 10)
                            .map((lesson) => (
                              <tr key={lesson.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm">
                                  {new Date(lesson.startTime).toLocaleDateString('ru-RU')}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  {new Date(lesson.startTime).toLocaleTimeString('ru-RU', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-4 py-2 text-sm">{lesson.type}</td>
                                <td className="px-4 py-2 text-sm">{lesson.durationMin} мин</td>
                                <td className="px-4 py-2">
                                  <span className={`text-sm font-medium ${getStatusColor(lesson.status)}`}>
                                    {getStatusText(lesson.status)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedClient.lessons.length > 10 && (
                      <div className="px-4 py-2 bg-gray-50 text-sm text-gray-600 text-center border-t">
                        Показаны последние 10 из {selectedClient.lessons.length} занятий
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Занятий пока нет</p>
                )}
              </div>

              {/* Платежи */}
              <div>
                <h3 className="text-lg font-semibold mb-3">История платежей</h3>
                {selectedClient.payments.length > 0 ? (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Сумма</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Метод</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Примечание</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedClient.payments
                            .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
                            .slice(0, 10)
                            .map((payment) => (
                              <tr key={payment.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm">
                                  {new Date(payment.dateTime).toLocaleDateString('ru-RU')}
                                </td>
                                <td className="px-4 py-2 text-sm font-semibold text-green-600">
                                  {parseFloat(payment.amount).toFixed(2)} ₽
                                </td>
                                <td className="px-4 py-2 text-sm">{payment.method}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">
                                  {payment.note || '-'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedClient.payments.length > 10 && (
                      <div className="px-4 py-2 bg-gray-50 text-sm text-gray-600 text-center border-t">
                        Показаны последние 10 из {selectedClient.payments.length} платежей
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">Платежей пока нет</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}