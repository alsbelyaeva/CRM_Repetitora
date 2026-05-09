import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { Briefcase, Check, Edit, MapPin, Plus, Repeat, Trash2, X, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppUser, getTeacherOptions, getUserLabel } from '../utils/admin';


interface Lesson {
  id: number;
  startTime: string;
  durationMin: number;
  type: string;
  status: string;
  notes?: string;
  recurringSeriesId?: number | null;
  client: { id?: number; fullName: string; address?: string | null };
}

interface ScheduleEvent {
  id: number;
  userId: string;
  title: string;
  startTime: string;
  durationMin: number;
  type: 'PERSONAL' | 'TRAVEL' | 'OTHER';
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  status: 'ACTIVE' | 'CANCELLED';
}

interface Client {
  id: number;
  fullName: string;
  address?: string | null;
}

type CalendarItem =
  | { kind: 'lesson'; id: number; startTime: string; durationMin: number; status: string; title: string; lesson: Lesson }
  | { kind: 'event'; id: number; startTime: string; durationMin: number; status: string; title: string; event: ScheduleEvent };

const eventTypes = [
  { value: 'PERSONAL', label: 'Личное' },
  { value: 'OTHER', label: 'Другое' },
];

function dateToInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeToInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isFutureCalendarDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return startOfLocalDay(date).getTime() > startOfLocalDay(new Date()).getTime();
}

export default function Calendar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showLessonDetailsModal, setShowLessonDetailsModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [cancelledDayModal, setCancelledDayModal] = useState<{
    dateLabel: string;
    items: CalendarItem[];
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMobileDay, setSelectedMobileDay] = useState<Date | null>(null);
  const [mobileCancelledExpanded, setMobileCancelledExpanded] = useState(false);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [recurringEditScope, setRecurringEditScope] = useState<'single' | 'future' | 'series'>('single');
  const weekdays = [
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
    { value: 7, label: 'Воскресенье' },
  ];

  const [formData, setFormData] = useState({
    clientId: '',
    date: '',
    startTime: '',
    durationMin: 60,
    type: 'Индивидуальное',
    status: 'PLANNED',
    notes: '',
    repeatEnabled: false,
    repeatWeekday: 1,
    repeatMode: 'count',
    repeatCount: 8,
    repeatUntil: '',
  });

  const [eventFormData, setEventFormData] = useState({
    title: '',
    date: '',
    startTime: '',
    durationMin: 60,
    type: 'PERSONAL' as ScheduleEvent['type'],
    location: '',
    notes: '',
    status: 'ACTIVE' as ScheduleEvent['status'],
  });

  const teacherQuery = selectedUserId ? `?userId=${selectedUserId}` : '';

  useEffect(() => {
    if (isAdmin) {
      axios.get(`${API_URL}/api/users`)
        .then((response) => setUsers(response.data))
        .catch((error) => console.error('Failed to fetch users:', error));
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchLessons();
    fetchEvents();
    fetchClients();
    fetchLessonStats();
  }, [selectedUserId]);

  const fetchLessons = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/lessons${teacherQuery}`);
      const sorted = response.data.sort((a: Lesson, b: Lesson) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setLessons(sorted);
    } catch (error) {
      console.error('Failed to fetch lessons:', error);
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/schedule-events${teacherQuery}`);
      const sorted = response.data.sort((a: ScheduleEvent, b: ScheduleEvent) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setEvents(sorted);
    } catch (error) {
      console.error('Failed to fetch schedule events:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/clients${teacherQuery}`);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchLessonStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/lessons/stats${teacherQuery}`);
      setCancelledCount(response.data.cancelled || 0);
      setDoneCount(response.data.done || 0);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const getRecurringScope = (status: string, actionOverride?: string): 'single' | 'future' | 'series' | null => {
    const action = status === 'CANCELLED'
      ? 'отменить'
      : status === 'PLANNED'
        ? 'восстановить'
        : 'изменить статус';
    const answer = prompt(
      `Это регулярное занятие. Что нужно ${actionOverride || action}?\n` +
      '1 - только это занятие\n' +
      '2 - это и все будущие занятия серии\n' +
      '3 - всю серию'
    );

    if (answer === '1') return 'single';
    if (answer === '2') return 'future';
    if (answer === '3') return 'series';
    return null;
  };

  const updateLessonStatus = async (lessonId: number, newStatus: string) => {
    try {
      const lesson = lessons.find((item) => item.id === lessonId) || selectedLesson;
      if (!lesson) {
        alert('Занятие не найдено');
        return;
      }

      if (newStatus === 'DONE' && isFutureCalendarDay(lesson.startTime)) {
        alert('Нельзя отметить проведенным занятие из будущей даты');
        return;
      }

      const scope = lesson.recurringSeriesId && newStatus !== 'DONE'
        ? getRecurringScope(newStatus)
        : 'single';

      if (!scope) return;

      await axios.patch(`${API_URL}/api/lessons/${lessonId}/status`, { status: newStatus, scope });
      await Promise.all([fetchLessons(), fetchLessonStats()]);
      setShowLessonDetailsModal(false);
      alert(`Статус занятия обновлен на "${getStatusText(newStatus)}"`);
    } catch (error: any) {
      console.error('Ошибка обновления статуса:', error);
      alert(error.response?.data?.message || error.response?.data?.error || 'Ошибка обновления статуса занятия');
    }
  };

  const updateEventStatus = async (eventId: number, status: ScheduleEvent['status']) => {
    try {
      await axios.patch(`${API_URL}/api/schedule-events/${eventId}/status`, { status });
      await fetchEvents();
      setShowEventModal(false);
      resetEventForm();
      alert(status === 'ACTIVE' ? '✅ Событие восстановлено' : '✅ Событие отменено');
    } catch (error: any) {
      alert(error.response?.data?.message || error.response?.data?.error || 'Ошибка изменения статуса события');
    }
  };

  const deleteEvent = async (eventId: number) => {
    if (!confirm('Удалить событие без возможности восстановления?')) return;

    try {
      await axios.delete(`${API_URL}/api/schedule-events/${eventId}`);
      await fetchEvents();
      setShowEventModal(false);
      resetEventForm();
      alert('✅ Событие удалено');
    } catch (error: any) {
      alert(error.response?.data?.message || error.response?.data?.error || 'Ошибка удаления события');
    }
  };

  const formatLessonTime = (startTime: string, durationMin: number) => {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    const startStr = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const endStr = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${startStr} - ${endStr}`;
  };

  const calculateEndTime = (date: string, time: string, duration: number): string => {
    if (!date || !time) return '—';
    try {
      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + duration * 60000);
      return end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startDateTime = `${formData.date}T${formData.startTime}:00`;
    const operationLabel = editingLesson ? 'обновления занятия' : 'создания занятия';

    try {
      const formattedData = {
        clientId: parseInt(formData.clientId),
        startTime: startDateTime,
        durationMin: parseInt(formData.durationMin.toString()),
        type: formData.type,
        status: formData.status,
        notes: formData.notes || null,
        ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
      };

      const editScope = editingLesson?.recurringSeriesId ? recurringEditScope : 'single';
      const response = editingLesson
        ? await axios.put(`${API_URL}/api/lessons/${editingLesson.id}`, { ...formattedData, scope: editScope })
        : formData.repeatEnabled
        ? await axios.post(`${API_URL}/api/lessons/recurring-series`, {
            clientId: formattedData.clientId,
            weekday: formData.repeatWeekday,
            startTime: formData.startTime,
            durationMin: formattedData.durationMin,
            startDate: formData.date,
            endDate: formData.repeatMode === 'date' ? formData.repeatUntil : undefined,
            repeatCount: formData.repeatMode === 'count' ? formData.repeatCount : undefined,
            type: formattedData.type,
            notes: formattedData.notes,
            ...(isAdmin && selectedUserId ? { userId: selectedUserId } : {}),
          })
        : await axios.post(`${API_URL}/api/lessons`, formattedData);

      setShowModal(false);
      await Promise.all([fetchLessons(), fetchLessonStats()]);
      resetForm();

      if (editingLesson) {
        alert('✅ Занятие обновлено');
      } else if (formData.repeatEnabled) {
        const skipped = response.data?.skippedCount || 0;
        const conflicts = response.data?.conflicts || [];
        const conflictText = conflicts.slice(0, 5).map((conflict: any) => (
          `${new Date(conflict.occurrence).toLocaleDateString('ru-RU')} ${conflict.time}: ${conflict.clientName}`
        )).join('\n');
        alert(`✅ Создано регулярных занятий: ${response.data?.createdCount || 0}` + (skipped ? `\n\nКонфликтующие даты добавлены в запросы слотов: ${skipped}\n${conflictText}` : ''));
      } else {
        alert('✅ Занятие успешно создано!');
      }
    } catch (error: any) {
      console.error(`Ошибка ${operationLabel}:`, error.response?.data || error);
      if (error.response?.status === 409) {
        const errorData = error.response.data;
        const conflictItems = errorData.conflictingLessons || errorData.conflicts || (errorData.conflict ? [errorData.conflict] : []);
        const conflictingItems = conflictItems.map((item: any) =>
          `${item.clientName || item.title || 'Занято'} (${new Date(item.startTime || item.occurrence).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})`
        ).join(', ');
        alert(`❌ ${errorData.error}\n\n${errorData.message || `Это время занято: ${conflictingItems}`}\n\nПожалуйста, выберите другое время.`);
      } else {
        alert(error.response?.data?.message || error.response?.data?.error || error.message || `Ошибка ${operationLabel}`);
      }
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAdmin && !selectedUserId && !editingEvent) {
      alert('Выберите преподавателя для события');
      return;
    }

    try {
      const payload = {
        title: eventFormData.title,
        startTime: `${eventFormData.date}T${eventFormData.startTime}:00`,
        durationMin: Number(eventFormData.durationMin),
        type: eventFormData.type,
        location: eventFormData.location || null,
        notes: eventFormData.notes || null,
        status: eventFormData.status,
        ...(isAdmin && selectedUserId && !editingEvent ? { userId: selectedUserId } : {}),
      };

      if (editingEvent) {
        await axios.put(`${API_URL}/api/schedule-events/${editingEvent.id}`, payload);
      } else {
        await axios.post(`${API_URL}/api/schedule-events`, payload);
      }

      await fetchEvents();
      setShowEventModal(false);
      resetEventForm();
      alert(editingEvent ? '✅ Событие обновлено' : '✅ Событие создано');
    } catch (error: any) {
      if (error.response?.status === 409) {
        alert(`❌ ${error.response.data.error}\n\n${error.response.data.message}`);
      } else {
        alert(error.response?.data?.message || error.response?.data?.error || 'Ошибка сохранения события');
      }
    }
  };

  const resetForm = () => {
    setEditingLesson(null);
    setRecurringEditScope('single');
    setFormData({
      clientId: '',
      date: '',
      startTime: '',
      durationMin: 60,
      type: 'Индивидуальное',
      status: 'PLANNED',
      notes: '',
      repeatEnabled: false,
      repeatWeekday: 1,
      repeatMode: 'count',
      repeatCount: 8,
      repeatUntil: '',
    });
  };

  const resetEventForm = () => {
    setEditingEvent(null);
    setEventFormData({
      title: '',
      date: '',
      startTime: '',
      durationMin: 60,
      type: 'PERSONAL',
      location: '',
      notes: '',
      status: 'ACTIVE',
    });
  };

  const openEditLesson = (lesson: Lesson) => {
    const start = new Date(lesson.startTime);
    setEditingLesson(lesson);
    setRecurringEditScope('single');
    setFormData({
      clientId: String(lesson.client?.id || ''),
      date: dateToInputValue(start),
      startTime: timeToInputValue(start),
      durationMin: lesson.durationMin,
      type: lesson.type,
      status: lesson.status,
      notes: lesson.notes || '',
      repeatEnabled: false,
      repeatWeekday: ((start.getDay() + 6) % 7) + 1,
      repeatMode: 'count',
      repeatCount: 8,
      repeatUntil: '',
    });
    setShowLessonDetailsModal(false);
    setShowModal(true);
  };

  const openEventModal = (event?: ScheduleEvent) => {
    if (event) {
      const start = new Date(event.startTime);
      setEditingEvent(event);
      setEventFormData({
        title: event.title,
        date: dateToInputValue(start),
        startTime: timeToInputValue(start),
        durationMin: event.durationMin,
        type: event.type === 'TRAVEL' ? 'OTHER' : event.type,
        location: event.location || '',
        notes: event.notes || '',
        status: event.status,
      });
    } else {
      resetEventForm();
    }
    setShowEventModal(true);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
    return days;
  };

  const getCalendarGridDays = (date: Date) => {
    const monthDays = getDaysInMonth(date);
    const firstDay = monthDays[0];
    const lastDay = monthDays[monthDays.length - 1];
    const leadingDaysCount = ((firstDay.getDay() + 6) % 7);
    const trailingDaysCount = (7 - (((lastDay.getDay() + 6) % 7) + 1)) % 7;
    const leadingDays = Array.from({ length: leadingDaysCount }, (_, index) => (
      new Date(date.getFullYear(), date.getMonth(), index - leadingDaysCount + 1)
    ));
    const trailingDays = Array.from({ length: trailingDaysCount }, (_, index) => (
      new Date(date.getFullYear(), date.getMonth() + 1, index + 1)
    ));

    return [...leadingDays, ...monthDays, ...trailingDays];
  };

  const toCalendarItems = (): CalendarItem[] => [
    ...lessons.map((lesson): CalendarItem => ({
      kind: 'lesson',
      id: lesson.id,
      startTime: lesson.startTime,
      durationMin: lesson.durationMin,
      status: lesson.status,
      title: lesson.client.fullName,
      lesson,
    })),
    ...events.map((event): CalendarItem => ({
      kind: 'event',
      id: event.id,
      startTime: event.startTime,
      durationMin: event.durationMin,
      status: event.status,
      title: event.title,
      event,
    })),
  ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const getItemsForDay = (date: Date) => toCalendarItems().filter((item) => {
    const itemDate = new Date(item.startTime);
    return itemDate.getDate() === date.getDate() &&
      itemDate.getMonth() === date.getMonth() &&
      itemDate.getFullYear() === date.getFullYear();
  });

  const getStatusColor = (item: CalendarItem) => {
    if (item.kind === 'event') {
      return item.status === 'CANCELLED'
        ? 'bg-gray-100 text-gray-600 border-gray-300'
        : 'bg-amber-50 text-amber-900 border-amber-300';
    }

    switch (item.status) {
      case 'DONE':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
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

  const getEventTypeText = (type: ScheduleEvent['type']) => (
    type === 'TRAVEL'
      ? 'Другое'
      : eventTypes.find(item => item.value === type)?.label || 'Событие'
  );
  const getEventStatusText = (status: ScheduleEvent['status']) => status === 'CANCELLED' ? 'Отменено' : 'Активно';

  const isSameDate = (left: Date, right: Date) => (
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear()
  );

  const openCalendarItem = (item: CalendarItem) => {
    if (item.kind === 'lesson') {
      setSelectedLesson(item.lesson);
      setShowLessonDetailsModal(true);
    } else {
      openEventModal(item.event);
    }
  };

  const getLessonClientAddress = (lesson: Lesson) => {
    const directAddress = lesson.client.address?.trim();
    if (directAddress) return directAddress;

    const clientFromList = lesson.client.id
      ? clients.find((client) => client.id === lesson.client.id)
      : clients.find((client) => client.fullName === lesson.client.fullName);

    return clientFromList?.address?.trim() || '';
  };

  const days = getCalendarGridDays(selectedDate);
  const selectedMobileDayItems = selectedMobileDay ? getItemsForDay(selectedMobileDay) : [];
  const selectedMobileActiveItems = selectedMobileDayItems.filter((item) => item.status !== 'CANCELLED');
  const selectedMobileCancelledItems = selectedMobileDayItems.filter((item) => item.status === 'CANCELLED');
  const canCreateEvent = !isAdmin || Boolean(selectedUserId);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Расписание</h1>
          <div className="flex flex-wrap gap-4 md:gap-6 mt-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Отменено:</span>
              <span className="font-semibold text-red-600">{cancelledCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Проведено:</span>
              <span className="font-semibold text-green-600">{doneCount}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center justify-center w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Добавить занятие
          </button>
          <button
            onClick={() => openEventModal()}
            disabled={!canCreateEvent}
            title={!canCreateEvent ? 'Выберите преподавателя' : undefined}
            className="flex items-center justify-center w-full sm:w-auto bg-amber-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Briefcase className="w-5 h-5 mr-2" />
            Добавить событие
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-semibold mb-2">Расписание преподавателя</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full md:w-80 px-4 py-3 md:py-2 border rounded-lg bg-white"
          >
            <option value="">Все преподаватели</option>
            {getTeacherOptions(users).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{getUserLabel(teacher)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-6">
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setMonth(newDate.getMonth() - 1);
              setSelectedDate(newDate);
            }}
            className="px-2 md:px-4 py-2 text-gray-600 hover:text-gray-800 text-sm md:text-base"
          >
            ← <span className="hidden sm:inline">Предыдущий</span>
          </button>
          <h2 className="text-base sm:text-xl font-semibold text-center">
            {selectedDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setMonth(newDate.getMonth() + 1);
              setSelectedDate(newDate);
            }}
            className="px-2 md:px-4 py-2 text-gray-600 hover:text-gray-800 text-sm md:text-base"
          >
            <span className="hidden sm:inline">Следующий</span> →
          </button>
        </div>

        <div className="md:hidden">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dayItems = getItemsForDay(day);
              const isCurrentMonth = day.getMonth() === selectedDate.getMonth() && day.getFullYear() === selectedDate.getFullYear();
              const isSelected = selectedMobileDay ? isSameDate(day, selectedMobileDay) : false;
              const isToday = isSameDate(day, new Date());
              const hasActiveLesson = dayItems.some((item) => item.kind === 'lesson' && item.status !== 'CANCELLED');
              const hasActiveEvent = dayItems.some((item) => item.kind === 'event' && item.status !== 'CANCELLED');
              const hasCancelled = dayItems.some((item) => item.status === 'CANCELLED');

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setSelectedMobileDay(day);
                    setMobileCancelledExpanded(false);
                  }}
                  className={`min-h-[54px] rounded-lg border px-1 py-2 flex flex-col items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : isCurrentMonth
                        ? 'border-gray-200 bg-white text-gray-800'
                        : 'border-gray-100 bg-gray-50 text-gray-400'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday && !isSelected ? 'bg-blue-600 text-white' : ''
                  }`}>
                    {day.getDate()}
                  </span>
                  <span className="mt-1 flex h-2 items-center justify-center gap-0.5">
                    {hasActiveLesson && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                    {hasActiveEvent && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {hasCancelled && <span className="h-1.5 w-1.5 rounded-full bg-red-300" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden md:grid grid-cols-7 gap-2">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
            <div key={day} className="text-center font-semibold text-gray-600 py-2">{day}</div>
          ))}

          {days.map((day) => {
            const dayItems = getItemsForDay(day);
            const activeItems = dayItems.filter((item) => item.status !== 'CANCELLED');
            const cancelledItems = dayItems.filter((item) => item.status === 'CANCELLED');
            const isCurrentMonth = day.getMonth() === selectedDate.getMonth() && day.getFullYear() === selectedDate.getFullYear();

            return (
              <div
                key={day.toISOString()}
                className={`border rounded-lg p-2 min-h-24 hover:bg-gray-50 flex flex-col ${
                  isCurrentMonth
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-100 bg-gray-50/70'
                }`}
              >
                <div className={`text-sm mb-1 ${isCurrentMonth ? 'text-gray-600' : 'text-gray-400'}`}>
                  {day.getDate()}
                </div>
                {dayItems.length > 0 && (
                  <div className="space-y-1 flex-1 flex flex-col">
                    <div className="space-y-1">
                      {activeItems.map((item) => (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          className={`w-full text-left text-xs rounded px-2 py-1 cursor-pointer border ${getStatusColor(item)}`}
                          onClick={() => openCalendarItem(item)}
                          title={`${item.title} - ${item.kind === 'event' ? getEventStatusText(item.event.status) : getStatusText(item.status)}`}
                        >
                          <div className="font-semibold">{formatLessonTime(item.startTime, item.durationMin)}</div>
                          <div className="truncate">{item.title}</div>
                          {item.kind === 'lesson' && item.lesson.recurringSeriesId && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
                              <Repeat className="w-3 h-3" />
                              регулярное
                            </div>
                          )}
                          {item.kind === 'event' && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold">
                              <Briefcase className="w-3 h-3" />
                              {getEventTypeText(item.event.type)}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {cancelledItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCancelledDayModal({ dateLabel: day.toLocaleDateString('ru-RU'), items: cancelledItems })}
                        className="mt-auto w-full text-left text-xs rounded px-2 py-1 border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        Отмененные: {cancelledItems.length}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedMobileDay && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-40 z-50 flex items-end">
          <div className="bg-white rounded-t-2xl w-full max-h-[88vh] min-h-[55vh] overflow-y-auto p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedMobileDay.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedMobileDay.toLocaleDateString('ru-RU', { weekday: 'long' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMobileDay(null);
                  setMobileCancelledExpanded(false);
                }}
                className="h-10 w-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedMobileDayItems.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-500">
                На этот день занятий и событий нет
              </div>
            ) : (
              <div className="space-y-3">
                {selectedMobileActiveItems.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className={`rounded-lg border p-3 ${getStatusColor(item)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {formatLessonTime(item.startTime, item.durationMin)}
                        </div>
                        <div className="mt-1 font-bold truncate">{item.title}</div>
                      </div>
                      <span className="text-xs font-semibold whitespace-nowrap">
                        {item.kind === 'event' ? getEventStatusText(item.event.status) : getStatusText(item.status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      {item.kind === 'lesson' && item.lesson.recurringSeriesId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-1">
                          <Repeat className="w-3 h-3" />
                          регулярное
                        </span>
                      )}
                      {item.kind === 'event' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-1">
                          <Briefcase className="w-3 h-3" />
                          {getEventTypeText(item.event.type)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMobileDay(null);
                        setMobileCancelledExpanded(false);
                        openCalendarItem(item);
                      }}
                      className="mt-3 w-full rounded-lg bg-gray-800 text-white px-4 py-2 font-semibold"
                    >
                      Открыть действия
                    </button>
                  </div>
                ))}

                {selectedMobileCancelledItems.length > 0 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setMobileCancelledExpanded(!mobileCancelledExpanded)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-left font-semibold text-gray-700 flex items-center justify-between"
                    >
                      <span>Отмененные занятия</span>
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs">
                        {selectedMobileCancelledItems.length}
                      </span>
                    </button>

                    {mobileCancelledExpanded && (
                      <div className="mt-3 space-y-3">
                        {selectedMobileCancelledItems.map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            className={`rounded-lg border p-3 ${getStatusColor(item)}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold">
                                  {formatLessonTime(item.startTime, item.durationMin)}
                                </div>
                                <div className="mt-1 font-bold truncate">{item.title}</div>
                              </div>
                              <span className="text-xs font-semibold whitespace-nowrap">
                                {item.kind === 'event' ? getEventStatusText(item.event.status) : getStatusText(item.status)}
                              </span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                              {item.kind === 'lesson' && item.lesson.recurringSeriesId && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-1">
                                  <Repeat className="w-3 h-3" />
                                  регулярное
                                </span>
                              )}
                              {item.kind === 'event' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2 py-1">
                                  <Briefcase className="w-3 h-3" />
                                  {getEventTypeText(item.event.type)}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMobileDay(null);
                                setMobileCancelledExpanded(false);
                                openCalendarItem(item);
                              }}
                              className="mt-3 w-full rounded-lg bg-gray-800 text-white px-4 py-2 font-semibold"
                            >
                              Открыть действия
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedMobileDay(null);
                setMobileCancelledExpanded(false);
              }}
              className="mt-4 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {cancelledDayModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold">Отмененные записи</h2>
                <p className="text-sm text-gray-600">{cancelledDayModal.dateLabel}</p>
              </div>
              <button onClick={() => setCancelledDayModal(null)}><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-2">
              {cancelledDayModal.items.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => {
                    setCancelledDayModal(null);
                    openCalendarItem(item);
                  }}
                  className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100"
                >
                  <div className="text-sm font-semibold text-gray-700">{formatLessonTime(item.startTime, item.durationMin)}</div>
                  <div className="text-sm text-gray-500">
                    {item.title} · Отменено{item.kind === 'event' ? ` · ${getEventTypeText(item.event.type)}` : item.lesson.recurringSeriesId ? ' · регулярное' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLessonDetailsModal && selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Детали занятия</h2>
              <button onClick={() => setShowLessonDetailsModal(false)}><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-4">
              <div><p className="text-sm text-gray-600">Клиент</p><p className="font-semibold">{selectedLesson.client.fullName}</p></div>
              <div>
                <p className="text-sm text-gray-600">Адрес ученика</p>
                <p className="font-semibold">{getLessonClientAddress(selectedLesson) || 'Адрес не задан'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Время</p>
                <p className="font-semibold">{new Date(selectedLesson.startTime).toLocaleString('ru-RU')}</p>
                <p className="text-sm">{formatLessonTime(selectedLesson.startTime, selectedLesson.durationMin)}</p>
              </div>
              <div><p className="text-sm text-gray-600">Тип</p><p className="font-semibold">{selectedLesson.type}{selectedLesson.recurringSeriesId ? ' · регулярное' : ''}</p></div>
              <div><p className="text-sm text-gray-600">Длительность</p><p className="font-semibold">{selectedLesson.durationMin} мин</p></div>
              <div>
                <p className="text-sm text-gray-600">Статус</p>
                <p className={`font-semibold ${selectedLesson.status === 'DONE' ? 'text-green-600' : selectedLesson.status === 'CANCELLED' ? 'text-red-600' : 'text-blue-600'}`}>
                  {getStatusText(selectedLesson.status)}
                </p>
              </div>

              {selectedLesson.notes && <div><p className="text-sm text-gray-600">Примечание</p><p className="text-sm">{selectedLesson.notes}</p></div>}

              <button onClick={() => openEditLesson(selectedLesson)} className="w-full flex items-center justify-center gap-2 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-800">
                <Edit className="w-5 h-5" />
                Редактировать
              </button>

              {isFutureCalendarDay(selectedLesson.startTime) && selectedLesson.status !== 'DONE' && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Проведенным можно отметить только занятие за сегодня или прошедшую дату.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4 border-t">
                <button
                  onClick={() => updateLessonStatus(selectedLesson.id, 'DONE')}
                  disabled={selectedLesson.status === 'DONE' || isFutureCalendarDay(selectedLesson.startTime)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${selectedLesson.status === 'DONE' || isFutureCalendarDay(selectedLesson.startTime) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                >
                  <Check className="w-5 h-5" />
                  Проведено
                </button>
                <button
                  onClick={() => updateLessonStatus(selectedLesson.id, 'CANCELLED')}
                  disabled={selectedLesson.status === 'CANCELLED'}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${selectedLesson.status === 'CANCELLED' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                >
                  <XCircle className="w-5 h-5" />
                  Отменено
                </button>
              </div>

              {(selectedLesson.status === 'DONE' || selectedLesson.status === 'CANCELLED') && (
                <button onClick={() => updateLessonStatus(selectedLesson.id, 'PLANNED')} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                  <Edit className="w-5 h-5" />
                  Вернуть в запланированные
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingEvent ? 'Редактировать событие' : 'Новое событие'}</h2>
              <button
                onClick={() => {
                  setShowEventModal(false);
                  resetEventForm();
                }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEventSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Название события</label>
                <input
                  value={eventFormData.title}
                  onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                  placeholder="Например: личное дело, экзамен"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Дата</label>
                <input
                  type="date"
                  value={eventFormData.date}
                  onChange={(e) => setEventFormData({ ...eventFormData, date: e.target.value })}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Время начала</label>
                <input
                  type="time"
                  value={eventFormData.startTime}
                  onChange={(e) => setEventFormData({ ...eventFormData, startTime: e.target.value })}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Длительность</label>
                <select
                  value={eventFormData.durationMin}
                  onChange={(e) => setEventFormData({ ...eventFormData, durationMin: Number(e.target.value) })}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                >
                  <option value="15">15 минут</option>
                  <option value="30">30 минут</option>
                  <option value="45">45 минут</option>
                  <option value="60">1 час</option>
                  <option value="90">1.5 часа</option>
                  <option value="120">2 часа</option>
                  <option value="180">3 часа</option>
                </select>
                {eventFormData.date && eventFormData.startTime && (
                  <p className="text-xs text-gray-500 mt-1">Окончание: {calculateEndTime(eventFormData.date, eventFormData.startTime, eventFormData.durationMin)}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Тип события</label>
                <select
                  value={eventFormData.type}
                  onChange={(e) => setEventFormData({ ...eventFormData, type: e.target.value as ScheduleEvent['type'] })}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                >
                  {eventTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Место или адрес</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    value={eventFormData.location}
                    onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 md:py-2 border rounded-lg"
                    placeholder="Необязательно"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Примечание</label>
                <textarea
                  value={eventFormData.notes}
                  onChange={(e) => setEventFormData({ ...eventFormData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                  placeholder="Дополнительная информация..."
                />
              </div>

              <button type="submit" className="w-full bg-amber-600 text-white py-3 rounded-lg hover:bg-amber-700 transition-colors">
                {editingEvent ? 'Сохранить событие' : 'Создать событие'}
              </button>
            </form>

            {editingEvent && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4 border-t">
                <button
                  onClick={() => updateEventStatus(editingEvent.id, editingEvent.status === 'CANCELLED' ? 'ACTIVE' : 'CANCELLED')}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-700 text-white hover:bg-gray-800"
                >
                  {editingEvent.status === 'CANCELLED' ? 'Восстановить' : 'Отменить'}
                </button>
                <button
                  onClick={() => deleteEvent(editingEvent.id)}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingLesson ? 'Редактировать занятие' : 'Новое занятие'}</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Клиент</label>
                <select value={formData.clientId} onChange={(e) => setFormData({ ...formData, clientId: e.target.value })} className="w-full px-4 py-3 md:py-2 border rounded-lg" required>
                  <option value="">Выберите клиента</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Дата занятия</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    const picked = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null;
                    setFormData({
                      ...formData,
                      date: e.target.value,
                      repeatWeekday: picked ? ((picked.getDay() + 6) % 7) + 1 : formData.repeatWeekday,
                    });
                  }}
                  className="w-full px-4 py-3 md:py-2 border rounded-lg"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Время начала</label>
                <input type="time" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} className="w-full px-4 py-3 md:py-2 border rounded-lg" required />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Длительность</label>
                <select value={formData.durationMin} onChange={(e) => setFormData({ ...formData, durationMin: parseInt(e.target.value) })} className="w-full px-4 py-3 md:py-2 border rounded-lg">
                  <option value="30">30 минут</option>
                  <option value="45">45 минут</option>
                  <option value="60">1 час</option>
                  <option value="90">1.5 часа</option>
                  <option value="120">2 часа</option>
                  <option value="150">2.5 часа</option>
                  <option value="180">3 часа</option>
                </select>
                {formData.date && formData.startTime && <p className="text-xs text-gray-500 mt-1">Окончание: {calculateEndTime(formData.date, formData.startTime, formData.durationMin)}</p>}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Тип</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-4 py-3 md:py-2 border rounded-lg">
                  <option value="Индивидуальное">Индивидуальное</option>
                  <option value="Групповое">Групповое</option>
                  <option value="Пробное">Пробное</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Примечание</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full px-4 py-3 md:py-2 border rounded-lg" placeholder="Дополнительная информация..." />
              </div>

              {!editingLesson && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <input type="checkbox" checked={formData.repeatEnabled} onChange={(e) => setFormData({ ...formData, repeatEnabled: e.target.checked })} className="h-4 w-4" />
                    Повторять занятие
                  </label>

                  {formData.repeatEnabled && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-sm font-semibold mb-2">День недели</label>
                        <select value={formData.repeatWeekday} onChange={(e) => setFormData({ ...formData, repeatWeekday: Number(e.target.value) })} className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white">
                          {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold mb-2">Ограничение повтора</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setFormData({ ...formData, repeatMode: 'count' })} className={`px-3 py-3 md:py-2 rounded-lg border text-sm font-semibold ${formData.repeatMode === 'count' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>По числу недель</button>
                          <button type="button" onClick={() => setFormData({ ...formData, repeatMode: 'date' })} className={`px-3 py-3 md:py-2 rounded-lg border text-sm font-semibold ${formData.repeatMode === 'date' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>До даты</button>
                        </div>
                      </div>

                      {formData.repeatMode === 'count' ? (
                        <div>
                          <label className="block text-sm font-semibold mb-2">Количество недель</label>
                          <input type="number" min="1" max="260" value={formData.repeatCount} onChange={(e) => setFormData({ ...formData, repeatCount: Number(e.target.value) })} className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white" />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-semibold mb-2">Дата окончания</label>
                          <input type="date" value={formData.repeatUntil} onChange={(e) => setFormData({ ...formData, repeatUntil: e.target.value })} className="w-full px-4 py-3 md:py-2 border rounded-lg bg-white" required={formData.repeatEnabled && formData.repeatMode === 'date'} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editingLesson?.recurringSeriesId && (
                <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                  <label className="block text-sm font-semibold text-gray-800 mb-3">Как применить изменения регулярного занятия</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { value: 'single', label: 'Только это занятие' },
                      { value: 'future', label: 'Это и будущие занятия серии' },
                      { value: 'series', label: 'Всю серию' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRecurringEditScope(option.value as 'single' | 'future' | 'series')}
                        className={`px-3 py-3 rounded-lg border text-sm font-semibold text-left transition-colors ${recurringEditScope === option.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors">
                {editingLesson ? 'Сохранить изменения' : 'Создать занятие'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
