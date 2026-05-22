import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';
import { AlertTriangle, Plus, Repeat, RotateCcw, Star, Trash2, TrendingUp, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppUser, getTeacherOptions, getUserLabel } from '../utils/admin';

const CONFIRMED_STATUSES = ['CONFIRMED', 'ACCEPTED'];

interface RecurrenceSettings {
  enabled: boolean;
  repeatMode: 'count' | 'date';
  repeatCount?: number;
  repeatUntil?: string;
}

interface RankedSlot {
  from: string;
  to: string;
  score: number;
  breakdown: {
    timeScore: number;
    compactScore: number;
    workingDayScore: number;
    priorityScore: number;
    travelScore: number;
  };
  weightedBreakdown?: {
    timeScore: number;
    compactScore: number;
    workingDayScore: number;
    priorityScore: number;
    travelScore: number;
  };
  criterionReasons?: {
    time?: string;
    compact?: string;
    workingDay?: string;
    priority?: string;
    travel?: string;
  };
  status: string;
  travelScore?: number;
  travelTimeMinutes?: number | null;
  availableGapMinutes?: number | null;
  travelDetails?: TravelDetails | null;
  explanation: string;
  hasConflict: boolean;
  lessonId?: number | null;
  recurrence?: RecurrenceSettings | null;
  recurringSeriesId?: number | null;
  conflictingLesson?: {
    id: number;
    clientName: string;
    startTime: string;
    kind?: 'lesson' | 'event';
  };
}

interface TravelLegDetails {
  direction: 'before' | 'after';
  source?: 'lesson' | 'event' | 'user_address';
  travelTimeMinutes: number | null;
  travelStatus?: string;
  availableGapMinutes: number | null;
  desiredBreakMinutes?: number;
  score: number;
  explanation?: string;
}

interface TravelDetails {
  score: number;
  travelTimeMinutes: number | null;
  availableGapMinutes: number | null;
  desiredBreakMinutes?: number;
  explanation?: string;
  before?: TravelLegDetails;
  after?: TravelLegDetails;
}

interface Client {
  id: number;
  fullName: string;
  vip?: boolean;
}

interface SlotRequestRecord {
  id: number;
  userId: string;
  clientId: number;
  status: string;
  proposedSlots: unknown;
  client: Client;
  user?: {
    id: string;
    fullName?: string;
    email: string;
  };
}

interface ClientRequest {
  requestId: number;
  userId: string;
  clientId: number;
  clientName: string;
  slots: RankedSlot[];
  vip: boolean;
  teacherName?: string;
  status: string;
}

interface SlotInput {
  date: string;
  startTime: string;
  durationMin: number;
}

type ScoreBreakdown = RankedSlot['breakdown'];

const SCORE_KEYS: Array<keyof ScoreBreakdown> = [
  'timeScore',
  'compactScore',
  'workingDayScore',
  'priorityScore',
  'travelScore',
];

function getBreakdownTotal(breakdown: ScoreBreakdown) {
  return SCORE_KEYS.reduce((sum, key) => sum + Math.max(0, Number(breakdown[key]) || 0), 0);
}

function hasPositiveBreakdown(breakdown?: Partial<ScoreBreakdown> | null) {
  return Boolean(breakdown && SCORE_KEYS.some((key) => Number(breakdown[key]) > 0));
}

function deriveWeightedBreakdown(score: number, breakdown: ScoreBreakdown): ScoreBreakdown {
  const total = getBreakdownTotal(breakdown);
  if (score <= 0 || total <= 0) {
    return {
      timeScore: 0,
      compactScore: 0,
      workingDayScore: 0,
      priorityScore: 0,
      travelScore: 0,
    };
  }

  return {
    timeScore: (Math.max(0, Number(breakdown.timeScore) || 0) / total) * score,
    compactScore: (Math.max(0, Number(breakdown.compactScore) || 0) / total) * score,
    workingDayScore: (Math.max(0, Number(breakdown.workingDayScore) || 0) / total) * score,
    priorityScore: (Math.max(0, Number(breakdown.priorityScore) || 0) / total) * score,
    travelScore: (Math.max(0, Number(breakdown.travelScore) || 0) / total) * score,
  };
}

function formatToISOLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function normalizeSlot(raw: any, fallbackStatus = 'PENDING'): RankedSlot | null {
  if (raw?.from && raw?.to) {
    const score = Number(raw.score ?? 0);
    const breakdown = {
      timeScore: 0,
      compactScore: 0,
      workingDayScore: 0,
      priorityScore: 0,
      travelScore: 0.5,
      ...(raw.breakdown ?? {}),
    };
    const hasStoredWeightedBreakdown = hasPositiveBreakdown(raw.weightedBreakdown);
    const weightedBreakdown = hasStoredWeightedBreakdown
      ? raw.weightedBreakdown
      : hasPositiveBreakdown(raw.breakdown)
        ? deriveWeightedBreakdown(score, breakdown)
        : {
            timeScore: 0,
            compactScore: 0,
            workingDayScore: 0,
            priorityScore: 0,
            travelScore: 0,
          };

    return {
      from: raw.from,
      to: raw.to,
      score,
      breakdown,
      weightedBreakdown,
      criterionReasons: raw.criterionReasons ?? {},
      status: raw.status || fallbackStatus,
      travelScore: Number(raw.travelScore ?? breakdown.travelScore ?? 0.5),
      travelTimeMinutes: raw.travelTimeMinutes ?? null,
      availableGapMinutes: raw.availableGapMinutes ?? null,
      travelDetails: raw.travelDetails ?? null,
      explanation: raw.explanation || 'Нейтральный слот',
      hasConflict: Boolean(raw.hasConflict),
      lessonId: raw.lessonId ?? null,
      recurrence: raw.recurrence ?? null,
      recurringSeriesId: raw.recurringSeriesId ?? null,
      conflictingLesson: raw.conflictingLesson,
    };
  }

  if (raw?.start && raw?.duration) {
    const from = new Date(raw.start);
    const to = new Date(from.getTime() + Number(raw.duration) * 60000);
    return {
      from: formatToISOLocal(from),
      to: formatToISOLocal(to),
      score: 0,
      status: raw.status || fallbackStatus,
      breakdown: {
        timeScore: 0,
        compactScore: 0,
        workingDayScore: 0,
        priorityScore: 0,
        travelScore: 0.5,
      },
      weightedBreakdown: {
        timeScore: 0,
        compactScore: 0,
        workingDayScore: 0,
        priorityScore: 0,
        travelScore: 0,
      },
      criterionReasons: {},
      travelScore: 0.5,
      travelTimeMinutes: null,
      availableGapMinutes: null,
      travelDetails: null,
      explanation: 'Слот создан до внедрения ранжирования',
      hasConflict: false,
      lessonId: raw.lessonId ?? null,
      recurrence: raw.recurrence ?? null,
      recurringSeriesId: raw.recurringSeriesId ?? null,
    };
  }

  return null;
}

function mapRequest(record: SlotRequestRecord): ClientRequest {
  const rawSlots = Array.isArray(record.proposedSlots) ? record.proposedSlots : [];
  const fallbackStatus = record.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING';
  const slots = rawSlots
    .map((slot) => normalizeSlot(slot, fallbackStatus))
    .filter((slot): slot is RankedSlot => Boolean(slot));

  return {
    requestId: record.id,
    userId: record.userId,
    clientId: record.clientId,
    clientName: record.client.fullName,
    slots,
    vip: Boolean(record.client.vip),
    teacherName: record.user ? getUserLabel(record.user as AppUser) : undefined,
    status: record.status,
  };
}

function isCancelledStatus(status?: string) {
  return status === 'CANCELLED';
}

function isConfirmedStatus(status?: string) {
  return Boolean(status && CONFIRMED_STATUSES.includes(status));
}

function isCancelledSlot(request: ClientRequest, slot: RankedSlot) {
  return isCancelledStatus(request.status) || isCancelledStatus(slot.status);
}

function isAssignedSlot(request: ClientRequest, slot: RankedSlot) {
  if (isCancelledSlot(request, slot)) return false;
  return isConfirmedStatus(request.status) || isConfirmedStatus(slot.status) || Boolean(slot.lessonId);
}

function isCompletedRequest(request: ClientRequest) {
  return isConfirmedStatus(request.status) || request.slots.some(slot => isAssignedSlot(request, slot));
}

function getStatusLabel(status?: string) {
  if (isCancelledStatus(status)) return 'Отменено';
  if (isConfirmedStatus(status)) return 'Подтверждено';
  return 'Активно';
}

function formatRequestCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'вариант'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'варианта'
      : 'вариантов';
  return `${count} ${word} на это время`;
}

function getConfirmedSlotView(slot: RankedSlot, lessonId?: number, recurringSeriesId?: number): RankedSlot {
  const score = slot.hasConflict && slot.score <= 10
    ? Math.round(slot.score * 1000) / 100
    : slot.score;

  return {
    ...slot,
    score,
    status: 'CONFIRMED',
    lessonId: lessonId ?? slot.lessonId ?? null,
    recurringSeriesId: recurringSeriesId ?? slot.recurringSeriesId ?? null,
    hasConflict: false,
    conflictingLesson: undefined,
    explanation: slot.explanation.startsWith('Конфликт')
      ? 'Подтверждено: занятие создано'
      : slot.explanation,
  };
}

function getIsoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastCalendarDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return startOfLocalDay(date).getTime() < startOfLocalDay(new Date()).getTime();
}

function formatTimeOnly(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function capitalizeExplanation(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed[0].toLocaleUpperCase('ru-RU') + trimmed.slice(1);
}

function isImpossibleTravelLeg(leg?: TravelLegDetails | null) {
  return Boolean(
    leg &&
    leg.travelTimeMinutes !== null &&
    leg.availableGapMinutes !== null &&
    Number(leg.availableGapMinutes) < Number(leg.travelTimeMinutes)
  );
}

function isTightUnverifiedTravelLeg(leg?: TravelLegDetails | null) {
  if (!leg || leg.travelTimeMinutes !== null || leg.availableGapMinutes === null) return false;
  const desiredBreak = leg.desiredBreakMinutes ?? 30;
  return Number(leg.availableGapMinutes) < desiredBreak;
}

function isCriticalTravelLeg(leg?: TravelLegDetails | null) {
  return isImpossibleTravelLeg(leg) || isTightUnverifiedTravelLeg(leg);
}

function hasImpossibleTravel(slot: RankedSlot) {
  const details = slot.travelDetails;
  return (
    isImpossibleTravelLeg(details?.before) ||
    isImpossibleTravelLeg(details?.after) ||
    (
      !details?.before &&
      !details?.after &&
      slot.travelTimeMinutes !== null &&
      slot.travelTimeMinutes !== undefined &&
      slot.availableGapMinutes !== null &&
      slot.availableGapMinutes !== undefined &&
      Number(slot.availableGapMinutes) < Number(slot.travelTimeMinutes)
    )
  );
}

function hasCriticalTravel(slot: RankedSlot) {
  const details = slot.travelDetails;
  return (
    isCriticalTravelLeg(details?.before) ||
    isCriticalTravelLeg(details?.after) ||
    hasImpossibleTravel(slot)
  );
}

function isVeryLargeTravelGap(minutes: number | null) {
  return minutes !== null && minutes >= 24 * 60;
}

function formatTravelLeg(leg: TravelLegDetails) {
  const itemLabel = leg.source === 'event' ? 'события' : 'занятия';
  const label = leg.direction === 'before'
    ? `После предыдущего ${itemLabel}`
    : `До следующего ${itemLabel}`;
  const gap = leg.availableGapMinutes;
  const travel = leg.travelTimeMinutes;

  if (leg.source === 'user_address') {
    if (travel === 0) {
      return 'Первое занятие в этот день: адрес совпадает с адресом преподавателя, дорога не требуется.';
    }

    if (travel !== null) {
      return `Первое занятие в этот день: дорога от адреса преподавателя около ${travel} мин.`;
    }

    return leg.explanation || 'Первое занятие в этот день: маршрут от адреса преподавателя не рассчитан.';
  }

  if (isVeryLargeTravelGap(gap)) {
    return leg.direction === 'before'
      ? `Предыдущее ${itemLabel} в другой день, дорога между занятиями не ограничивает этот слот.`
      : `Следующее ${itemLabel} в другой день, дорога между занятиями не ограничивает этот слот.`;
  }

  if (isImpossibleTravelLeg(leg)) {
    return `${label}: между занятиями ${gap} мин, дорога занимает ${travel} мин. Вы не успеете добраться.`;
  }

  if (isTightUnverifiedTravelLeg(leg)) {
    return `${label}: между занятиями только ${gap} мин, маршрут не рассчитан. Вы можете не успеть добраться.`;
  }

  if (travel !== null && gap !== null) {
    return `${label}: дорога ${travel} мин, между занятиями ${gap} мин.`;
  }

  if (travel !== null) {
    return `${label}: дорога ${travel} мин.`;
  }

  return '';
}

function getTravelCardDetail(slot: RankedSlot) {
  const details = slot.travelDetails;
  const legs = [details?.before, details?.after].filter((leg): leg is TravelLegDetails => Boolean(leg));
  const sameDayNeighborLegs = legs.filter(leg => (
    leg.source !== 'user_address' && !isVeryLargeTravelGap(leg.availableGapMinutes)
  ));
  const userAddressLeg = legs.find(leg => leg.source === 'user_address');

  if (sameDayNeighborLegs.length === 0) {
    const onlyLessonText = 'Единственное занятие в этот день: дорога между занятиями не ограничивает слот.';
    const travel = userAddressLeg?.travelTimeMinutes;

    if (travel === 0) {
      return `${onlyLessonText} Адрес совпадает с адресом преподавателя.`;
    }

    if (travel !== null && travel !== undefined) {
      return `${onlyLessonText} От адреса преподавателя до клиента: около ${travel} мин.`;
    }

    return onlyLessonText;
  }

  const criticalLegs = sameDayNeighborLegs.filter(isCriticalTravelLeg);
  const lines: string[] = criticalLegs.length > 0
    ? criticalLegs.map(formatTravelLeg)
    : sameDayNeighborLegs
        .filter(leg => leg.travelTimeMinutes !== null)
        .map(formatTravelLeg);

  if (lines.length === 0) {
    lines.push(
      ...[
        slot.travelTimeMinutes === null || slot.travelTimeMinutes === undefined
          ? ''
          : `Дорога: ${slot.travelTimeMinutes} мин.`,
        slot.availableGapMinutes !== null && slot.availableGapMinutes !== undefined
          ? `Окно: ${slot.availableGapMinutes} мин.`
          : '',
      ].filter(Boolean)
    );
  }

  if (hasImpossibleTravel(slot) && criticalLegs.length === 0) {
    lines.unshift(
      `Не успеть: доступно ${slot.availableGapMinutes} мин, дорога занимает ${slot.travelTimeMinutes} мин.`
    );
  }

  const detail = Array.from(new Set(lines.filter(Boolean))).join(' ');
  if (detail) return detail;
  if (details?.explanation) return details.explanation;
  if (Number(slot.travelScore) > 0) {
    return 'Подробности дороги не сохранены для этого слота. Обновите оценку слотов, чтобы пересчитать маршрут.';
  }

  return '';
}

function getScoreCards(slot: RankedSlot) {
  const contribution = slot.weightedBreakdown || slot.breakdown;
  const reasons = slot.criterionReasons || {};
  const travelCritical = hasCriticalTravel(slot);
  const cards = [
    {
      key: 'time',
      label: 'Время',
      value: contribution.timeScore,
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      detail: reasons.time,
    },
    {
      key: 'compact',
      label: 'Компактность',
      value: contribution.compactScore,
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-700',
      detail: reasons.compact,
    },
    {
      key: 'workingDay',
      label: 'Рабочий день',
      value: contribution.workingDayScore,
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      detail: reasons.workingDay,
    },
    {
      key: 'priority',
      label: 'Приоритет',
      value: contribution.priorityScore,
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      detail: reasons.priority,
    },
    {
      key: 'travel',
      label: 'Дорога',
      value: contribution.travelScore,
      bg: travelCritical ? 'bg-red-50' : 'bg-cyan-50',
      border: travelCritical ? 'border-red-300' : 'border-cyan-200',
      text: travelCritical ? 'text-red-700' : 'text-cyan-700',
      detail: getTravelCardDetail(slot) || reasons.travel,
      warning: travelCritical,
    },
  ];

  return cards;
}

export default function SlotRequests() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [slots, setSlots] = useState<SlotInput[]>([{ date: '', startTime: '', durationMin: 60 }]);
  const [allClientRequests, setAllClientRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [recurrence, setRecurrence] = useState<RecurrenceSettings>({
    enabled: false,
    repeatMode: 'count',
    repeatCount: 8,
    repeatUntil: '',
  });

  const teacherQuery = selectedUserId ? `?userId=${selectedUserId}` : '';
  const slotMatchesFilter = (request: ClientRequest, slot: RankedSlot) => {
    if (isCompletedRequest(request)) return false;

    const cancelled = isCancelledSlot(request, slot);
    if (requestFilter === 'cancelled') return cancelled;
    if (isAssignedSlot(request, slot)) return false;
    if (requestFilter === 'active') return !cancelled;
    return true;
  };

  useEffect(() => {
    if (isAdmin) {
      axios.get(`${API_URL}/api/users`)
        .then((response) => setUsers(response.data))
        .catch((error) => console.error('Failed to fetch users:', error));
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchClients();
    fetchRequests();
  }, [selectedUserId, isAdmin, requestFilter]);

  const fetchClients = async () => {
    try {
      if (isAdmin && !selectedUserId) {
        setClients([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/clients${teacherQuery}`);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      if (isAdmin && !selectedUserId) {
        setAllClientRequests([]);
        return;
      }

      const params = new URLSearchParams();
      params.set('status', requestFilter);
      if (selectedUserId) params.set('userId', selectedUserId);

      const response = await axios.get(`${API_URL}/api/slot-requests?${params.toString()}`);
      const mapped = await Promise.all(response.data
        .map(mapRequest)
        .map(refreshPendingSlotScores));
      const visibleRequests = mapped
        .filter((request: ClientRequest) => request.slots.some(slot => slotMatchesFilter(request, slot)));

      setAllClientRequests(visibleRequests);
    } catch (error) {
      console.error('Failed to fetch slot requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshPendingSlotScores = async (request: ClientRequest): Promise<ClientRequest> => {
    const slotsToRank = request.slots.filter(slot => (
      slot.from &&
      slot.to &&
      !isAssignedSlot(request, slot)
    ));

    if (slotsToRank.length === 0) return request;

    try {
      const response = await axios.post(`${API_URL}/api/slots/rank`, {
        clientId: request.clientId,
        proposedSlots: slotsToRank.map(slot => ({ from: slot.from, to: slot.to })),
        ...(isAdmin ? { userId: selectedUserId } : {}),
      });

      const rankedByTime = new Map<string, RankedSlot>(
        response.data.rankedSlots.map((slot: RankedSlot) => [`${slot.from}-${slot.to}`, slot])
      );

      const refreshedRequest = {
        ...request,
        slots: request.slots.map(slot => {
          const ranked = rankedByTime.get(`${slot.from}-${slot.to}`);
          if (!ranked) return slot;

          const isConfirmedSlot = isConfirmedStatus(slot.status);
          return {
            ...slot,
            score: isConfirmedSlot ? slot.score : ranked.score,
            breakdown: ranked.breakdown,
            weightedBreakdown: ranked.weightedBreakdown,
            criterionReasons: ranked.criterionReasons,
            travelScore: ranked.travelScore,
            travelTimeMinutes: ranked.travelTimeMinutes,
            availableGapMinutes: ranked.availableGapMinutes,
            travelDetails: ranked.travelDetails ?? null,
            explanation: isConfirmedSlot ? slot.explanation : ranked.explanation,
            hasConflict: isConfirmedSlot ? false : ranked.hasConflict,
            conflictingLesson: isConfirmedSlot ? undefined : ranked.conflictingLesson,
            status: slot.status,
            lessonId: slot.lessonId,
            recurrence: slot.recurrence ?? null,
            recurringSeriesId: slot.recurringSeriesId ?? null,
          };
        }),
      };

      if (JSON.stringify(refreshedRequest.slots) !== JSON.stringify(request.slots)) {
        await axios.put(`${API_URL}/api/slot-requests/${request.requestId}`, {
          proposedSlots: refreshedRequest.slots,
          status: request.status,
        });
      }

      return refreshedRequest;
    } catch (error) {
      console.error('Failed to refresh slot scores:', error);
      return request;
    }
  };

  const addSlot = () => {
    setSlots([...slots, { date: '', startTime: '', durationMin: 60 }]);
  };

  const removeSlot = (index: number) => {
    if (slots.length === 1) {
      alert('Должен остаться хотя бы один слот');
      return;
    }
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof SlotInput, value: string | number) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  const calculateEndTime = (date: string, time: string, duration: number): string => {
    if (!date || !time) return '-';
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + duration * 60000);
    return end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleAddClientRequest = async () => {
    if (!selectedClient) {
      alert('Выберите клиента');
      return;
    }

    if (isAdmin && !selectedUserId) {
      alert('Выберите преподавателя');
      return;
    }

    const validSlots = slots.filter(s => s.date && s.startTime);
    if (validSlots.length === 0) {
      alert('Добавьте хотя бы один слот с датой и временем');
      return;
    }

    const proposedSlots = validSlots.map(slot => {
      const from = `${slot.date}T${slot.startTime}:00`;
      const fromDate = new Date(from);
      const toDate = new Date(fromDate.getTime() + slot.durationMin * 60000);
      return { from, to: formatToISOLocal(toDate) };
    });

    if (proposedSlots.some(slot => new Date(slot.to) <= new Date(slot.from))) {
      alert('Время окончания слота должно быть позже времени начала');
      return;
    }

    if (proposedSlots.some(slot => isPastCalendarDay(slot.from))) {
      alert('Запросы слотов нельзя создавать на прошедшие даты. Задним числом занятие можно добавить только в календаре как проведенное.');
      return;
    }

    if (recurrence.enabled) {
      if (recurrence.repeatMode === 'count' && (!recurrence.repeatCount || recurrence.repeatCount < 1)) {
        alert('Укажите количество недель для регулярного занятия');
        return;
      }

      if (recurrence.repeatMode === 'date' && !recurrence.repeatUntil) {
        alert('Укажите дату окончания регулярного занятия');
        return;
      }
    }

    try {
      const rankingResponse = await axios.post(`${API_URL}/api/slots/rank`, {
        clientId: Number(selectedClient),
        proposedSlots,
        ...(isAdmin ? { userId: selectedUserId } : {}),
      });

      const rankedSlots = rankingResponse.data.rankedSlots.map((slot: RankedSlot) => ({
        ...slot,
        recurrence: recurrence.enabled
          ? {
              enabled: true,
              repeatMode: recurrence.repeatMode,
              repeatCount: recurrence.repeatMode === 'count' ? recurrence.repeatCount : undefined,
              repeatUntil: recurrence.repeatMode === 'date' ? recurrence.repeatUntil : undefined,
            }
          : null,
      }));

      await axios.post(`${API_URL}/api/slot-requests`, {
        clientId: Number(selectedClient),
        proposedSlots: rankedSlots,
        status: 'PENDING',
        ...(isAdmin ? { userId: selectedUserId } : {}),
      });

      setShowModal(false);
      setSelectedClient('');
      setSlots([{ date: '', startTime: '', durationMin: 60 }]);
      setRecurrence({ enabled: false, repeatMode: 'count', repeatCount: 8, repeatUntil: '' });
      await fetchRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Ошибка ранжирования');
    }
  };

  const groupSlotsByTime = () => {
    const grouped: Map<string, Array<{
      requestId: number;
      clientId: number;
      clientName: string;
      slot: RankedSlot;
      vip: boolean;
      slotIndex: number;
      teacherName?: string;
      requestStatus: string;
    }>> = new Map();

    allClientRequests.forEach((request) => {
      request.slots.forEach((slot, slotIndex) => {
        if (!slotMatchesFilter(request, slot)) return;

        const timeKey = `${slot.from}-${slot.to}`;

        if (!grouped.has(timeKey)) {
          grouped.set(timeKey, []);
        }

        grouped.get(timeKey)!.push({
          requestId: request.requestId,
          clientId: request.clientId,
          clientName: request.clientName,
          slot,
          vip: request.vip,
          slotIndex,
          teacherName: request.teacherName,
          requestStatus: request.status,
        });
      });
    });

    return grouped;
  };

  const markAcceptedSlot = async (
    acceptedRequestId: number,
    acceptedSlotIndex: number,
    lessonId?: number,
    recurringSeriesId?: number
  ) => {
    const updates = allClientRequests.map(async (request) => {
      const updatedSlots = request.slots.map((slot, slotIndex) => {
        if (request.requestId !== acceptedRequestId) return slot;
        if (slotIndex === acceptedSlotIndex) return getConfirmedSlotView(slot, lessonId, recurringSeriesId);
        if (isCancelledStatus(slot.status)) return slot;
        return { ...slot, status: 'CANCELLED' };
      });

      if (request.requestId !== acceptedRequestId) return;

      const nextStatus = updatedSlots.every(slot => isCancelledStatus(slot.status))
        ? 'CANCELLED'
        : updatedSlots.some(slot => isConfirmedStatus(slot.status))
          ? 'CONFIRMED'
          : request.status;

      await axios.put(`${API_URL}/api/slot-requests/${request.requestId}`, {
        proposedSlots: updatedSlots,
        status: nextStatus,
      });
    });

    await Promise.all(updates);
    await fetchRequests();
  };

  const createLessonForClient = async (
    requestId: number,
    slotIndex: number,
    clientId: number,
    slot: RankedSlot
  ) => {
    try {
      const from = new Date(slot.from);
      const to = new Date(slot.to);
      const duration = Math.round((to.getTime() - from.getTime()) / 60000);
      let createdLessonId: number | undefined;
      let createdSeriesId: number | undefined;

      if (isPastCalendarDay(from)) {
        alert('Нельзя подтвердить запрос слота за прошедшую дату. Задним числом занятие можно добавить только в календаре как проведенное.');
        return;
      }

      if (slot.recurrence?.enabled && slot.hasConflict) {
        alert('Первый слот регулярного занятия конфликтует с расписанием. Освободите этот слот или выберите другой вариант для серии.');
        return;
      }

      if (slot.recurrence?.enabled) {
        const response = await axios.post(`${API_URL}/api/lessons/recurring-series`, {
          clientId,
          weekday: getIsoWeekday(from),
          startTime: formatTimeOnly(from),
          durationMin: duration,
          startDate: formatDateOnly(from),
          endDate: slot.recurrence.repeatMode === 'date' ? slot.recurrence.repeatUntil : undefined,
          repeatCount: slot.recurrence.repeatMode === 'count' ? slot.recurrence.repeatCount : undefined,
          type: 'Индивидуальное',
          ...(isAdmin ? { userId: selectedUserId } : {}),
        });
        createdLessonId = response.data?.lessons?.[0]?.id;
        createdSeriesId = response.data?.series?.id;
        const skipped = response.data?.skippedCount || 0;
        if (skipped > 0) {
          const conflicts = response.data?.conflicts || [];
          const conflictText = conflicts.slice(0, 5).map((conflict: any) => (
            `${new Date(conflict.occurrence).toLocaleDateString('ru-RU')} ${conflict.time}: ${conflict.clientName}`
          )).join('\n');
          alert(`Регулярные занятия созданы частично. Конфликтующие даты добавлены в запросы слотов: ${skipped}\n${conflictText}`);
        }
      } else if (slot.hasConflict && slot.conflictingLesson) {
        const confirmReplace = confirm(
          `Это время занято клиентом "${slot.conflictingLesson.clientName}". Отменить старое занятие и создать новое?`
        );

        if (!confirmReplace) return;

        const response = await axios.post(`${API_URL}/api/slots/replace`, {
          conflictingLessonId: slot.conflictingLesson.id,
          selectedSlot: slot,
          clientId,
          durationMin: duration,
          type: 'Индивидуальное',
          ...(isAdmin ? { userId: selectedUserId } : {}),
        });
        createdLessonId = response.data?.lesson?.id;
      } else {
        const response = await axios.post(`${API_URL}/api/lessons`, {
          clientId,
          startTime: slot.from,
          durationMin: duration,
          type: 'Индивидуальное',
          status: 'PLANNED',
          ...(isAdmin ? { userId: selectedUserId } : {}),
        });
        createdLessonId = response.data?.id;
      }

      await markAcceptedSlot(requestId, slotIndex, createdLessonId, createdSeriesId);
      if (createdSeriesId) {
        alert('Регулярные занятия созданы');
      } else {
        alert('Занятие создано');
      }
    } catch (error: any) {
      await fetchRequests();
      alert(error.response?.data?.message || error.response?.data?.error || 'Ошибка создания занятия');
    }
  };

  const rejectSlot = async (requestId: number, slotIndex: number) => {
    try {
      await axios.patch(`${API_URL}/api/slot-requests/${requestId}/reject`, { slotIndex });
      await fetchRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка отклонения слота');
    }
  };

  const clearAllRequests = async () => {
    if (!confirm('Отменить все отображаемые запросы? Их можно будет восстановить.')) return;

    try {
      await Promise.all(allClientRequests.map(request => (
        axios.delete(`${API_URL}/api/slot-requests/${request.requestId}`)
      )));
      await fetchRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка очистки запросов');
    }
  };

  const restoreSlot = async (requestId: number, slotIndex: number) => {
    try {
      await axios.patch(`${API_URL}/api/slot-requests/${requestId}/slots/${slotIndex}/restore`);
      await fetchRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка восстановления слота');
    }
  };

  const cancelSelectedSlot = async (requestId: number, slotIndex: number) => {
    if (!confirm('Отменить выбор этого слота и связанное занятие?')) return;

    try {
      await axios.patch(`${API_URL}/api/slot-requests/${requestId}/slots/${slotIndex}/cancel-selection`);
      await fetchRequests();
      alert('Выбор отменен');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка отмены выбора');
    }
  };

  const formatDateTime = (isoString: string) => {
    return new Date(isoString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const grouped = groupSlotsByTime();
  const entries = Array.from(grouped.entries()).sort(([, aRequests], [, bRequests]) => {
    const aCancelled = aRequests.every(req => isCancelledStatus(req.requestStatus) || isCancelledStatus(req.slot.status)) ? 1 : 0;
    const bCancelled = bRequests.every(req => isCancelledStatus(req.requestStatus) || isCancelledStatus(req.slot.status)) ? 1 : 0;
    if (aCancelled !== bCancelled) return aCancelled - bCancelled;
    return new Date(aRequests[0]?.slot.from ?? 0).getTime() - new Date(bRequests[0]?.slot.from ?? 0).getTime();
  });
  const activeSlotCount = allClientRequests.reduce((sum, request) => (
    sum + request.slots.filter(slot => !isCancelledSlot(request, slot) && !isAssignedSlot(request, slot)).length
  ), 0);
  const cancelledSlotCount = allClientRequests.reduce((sum, request) => (
    sum + request.slots.filter(slot => isCancelledSlot(request, slot)).length
  ), 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Запросы слотов</h1>
        <button
          onClick={() => {
            setSelectedClient('');
            setSlots([{ date: '', startTime: '', durationMin: 60 }]);
            setRecurrence({ enabled: false, repeatMode: 'count', repeatCount: 8, repeatUntil: '' });
            setShowModal(true);
          }}
          disabled={isAdmin && !selectedUserId}
          className="flex items-center justify-center w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5 mr-2" />
          Добавить запрос
        </button>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-semibold mb-2">Запросы преподавателя</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full md:w-80 px-4 py-3 md:py-2 border rounded-lg bg-white"
          >
            <option value="">Выберите преподавателя</option>
            {getTeacherOptions(users).map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {getUserLabel(teacher)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Фильтр запросов</h2>
            <p className="text-sm text-gray-600">
              Активные: {activeSlotCount} · Отмененные: {cancelledSlotCount}
            </p>
          </div>
          <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-200 overflow-hidden self-start">
            {[
              { value: 'all', label: 'Все' },
              { value: 'active', label: 'Активные' },
              { value: 'cancelled', label: 'Отмененные' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setRequestFilter(item.value as 'all' | 'active' | 'cancelled')}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-3 sm:py-2 text-sm font-semibold ${
                  requestFilter === item.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="bg-white rounded-lg shadow p-4 md:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
            <h2 className="text-xl font-bold">
              Запросы слотов ({allClientRequests.length})
            </h2>
            <button
              onClick={clearAllRequests}
              className="flex items-center justify-center w-full sm:w-auto text-red-600 hover:text-red-800 font-medium text-sm"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Отменить все
            </button>
          </div>

          <div className="space-y-6">
            {entries.map(([timeKey, requests], index) => {
              const hasMultipleClients = requests.length > 1;
              const hasConflict = requests.some(r => (
                !isCancelledStatus(r.requestStatus) &&
                !isCancelledStatus(r.slot.status) &&
                !isConfirmedStatus(r.requestStatus) &&
                !isConfirmedStatus(r.slot.status) &&
                r.slot.hasConflict
              ));
              const groupCancelled = requests.every(r => isCancelledStatus(r.requestStatus) || isCancelledStatus(r.slot.status));

              return (
                <div
                  key={`${timeKey}-${index}`}
                  className={`border-2 rounded-lg p-4 md:p-5 ${
                    groupCancelled
                      ? 'border-gray-200 bg-gray-50 opacity-90'
                      : hasMultipleClients
                      ? 'border-yellow-400 bg-yellow-50'
                      : hasConflict
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="mb-4 pb-3 border-b">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      {hasMultipleClients && <AlertTriangle className="w-6 h-6 text-yellow-600" />}
                      <span className={`font-bold text-lg md:text-xl ${groupCancelled ? 'text-gray-500 line-through decoration-gray-400' : ''}`}>
                        {formatDateTime(requests[0].slot.from)} - {formatTime(requests[0].slot.to)}
                      </span>
                      {groupCancelled && (
                        <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full font-bold">
                          Отменено
                        </span>
                      )}
                      {hasMultipleClients && (
                        <span className="px-3 py-1 bg-yellow-200 text-yellow-900 text-sm rounded-full font-bold">
                          {formatRequestCount(requests.length)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {requests.map((req) => {
                      const itemCancelled = isCancelledStatus(req.requestStatus) || isCancelledStatus(req.slot.status);
                      const itemConfirmed = isConfirmedStatus(req.requestStatus) || isConfirmedStatus(req.slot.status);
                      const displaySlot = itemConfirmed ? getConfirmedSlotView(req.slot) : req.slot;
                      const isEventConflict = Boolean(req.slot.hasConflict && req.slot.conflictingLesson?.kind === 'event');
                      const impossibleTravel = hasCriticalTravel(displaySlot);

                      return (
                      <div
                        key={`${req.requestId}-${req.slotIndex}`}
                        className={`border-2 rounded-lg p-4 transition-shadow ${
                          itemCancelled
                            ? 'border-gray-200 bg-gray-100 text-gray-500'
                            : 'border-gray-300 bg-white hover:shadow-md'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className={`font-bold text-lg ${itemCancelled ? 'line-through decoration-gray-400' : ''}`}>
                                {req.clientName}
                              </span>
                              {isAdmin && req.teacherName && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                                  {req.teacherName}
                                </span>
                              )}
                              {req.vip && (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-semibold">
                                  <Star className="w-3 h-3 fill-current" />
                                  VIP
                                </div>
                              )}
                              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full font-bold">
                                {displaySlot.score.toFixed(2)}
                              </span>
                              <span className={`px-3 py-1 text-sm rounded-full font-bold ${
                                itemCancelled
                                  ? 'bg-gray-200 text-gray-700'
                                  : itemConfirmed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                              }`}>
                                {getStatusLabel(itemCancelled ? 'CANCELLED' : itemConfirmed ? 'CONFIRMED' : 'PENDING')}
                              </span>
                              {displaySlot.recurrence?.enabled && (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-800 text-sm rounded-full font-bold">
                                  <Repeat className="w-3 h-3" />
                                  Регулярное
                                </span>
                              )}
                              {impossibleTravel && !itemCancelled && (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  Не успеть на дорогу
                                </span>
                              )}
                            </div>

                            {(displaySlot.hasConflict || impossibleTravel) && (
                              <p className="text-sm mb-3 text-red-700 font-semibold">
                                {impossibleTravel
                                  ? 'Недостаточно времени между занятиями: проверьте блок “Дорога”.'
                                  : capitalizeExplanation(displaySlot.explanation)}
                              </p>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                              {getScoreCards(displaySlot).map(card => (
                                <div key={card.key} className={`${card.bg} p-3 rounded-lg border ${card.border}`}>
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className={`inline-flex items-center gap-1 text-sm font-semibold ${card.text}`}>
                                      {card.warning && <AlertTriangle className="w-4 h-4" />}
                                      {card.label}
                                    </div>
                                    <div className={`text-lg font-bold ${card.text}`}>{card.value.toFixed(2)}</div>
                                  </div>
                                  {card.detail && (
                                    <div className="text-xs text-gray-700 mt-2 leading-snug">{capitalizeExplanation(card.detail)}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex w-full lg:w-auto lg:min-w-40 flex-col gap-2">
                            {itemCancelled ? (
                              <button
                                onClick={() => restoreSlot(req.requestId, req.slotIndex)}
                                className="flex items-center justify-center px-4 py-3 lg:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold whitespace-nowrap"
                              >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Вернуть
                              </button>
                            ) : itemConfirmed ? (
                              <>
                                <span className="px-4 py-3 lg:py-2 bg-emerald-100 text-emerald-800 rounded-lg font-semibold text-center whitespace-nowrap">
                                  Подтверждено
                                </span>
                                <button
                                  onClick={() => cancelSelectedSlot(req.requestId, req.slotIndex)}
                                  className="px-4 py-3 lg:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold whitespace-nowrap"
                                >
                                  Отменить выбор
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => createLessonForClient(req.requestId, req.slotIndex, req.clientId, req.slot)}
                                  disabled={isEventConflict}
                                  className={`px-4 py-3 lg:py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                                    isEventConflict
                                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                      : req.slot.hasConflict
                                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                                      : 'bg-green-600 text-white hover:bg-green-700'
                                  }`}
                                >
                                  {isEventConflict ? 'Время занято' : req.slot.hasConflict ? 'Заменить' : req.slot.recurrence?.enabled ? 'Принять серию' : 'Принять'}
                                </button>

                                <button
                                  onClick={() => rejectSlot(req.requestId, req.slotIndex)}
                                  className="px-4 py-3 lg:py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
                                >
                                  Отклонить
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 md:p-12 text-center">
          <TrendingUp className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            {loading ? 'Загрузка...' : 'Нет активных запросов'}
          </h3>
          <p className="text-gray-600 mb-6">
            {isAdmin && !selectedUserId
              ? 'Выберите преподавателя, чтобы посмотреть его запросы'
              : 'Создайте новый запрос для ранжирования предложенных клиентом слотов'}
          </p>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 md:p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Добавить запрос клиента</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setRecurrence({ enabled: false, repeatMode: 'count', repeatCount: 8, repeatUntil: '' });
                }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Клиент</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full px-4 py-3 md:py-2 border rounded-lg"
                required
              >
                <option value="">Выберите клиента</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName} {client.vip ? 'VIP' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                <label className="block text-sm font-semibold">Предложенные слоты</label>
                <button
                  type="button"
                  onClick={addSlot}
                  className="text-blue-600 hover:text-blue-800 text-sm font-semibold self-start sm:self-auto"
                >
                  Добавить слот
                </button>
              </div>

              <div className="space-y-3">
                {slots.map((slot, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Дата</label>
                        <input
                          type="date"
                          value={slot.date}
                          min={formatDateOnly(new Date())}
                          onChange={(e) => updateSlot(idx, 'date', e.target.value)}
                          className="w-full px-3 py-3 md:py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Время начала</label>
                        <input
                          type="time"
                          value={slot.startTime}
                          onChange={(e) => updateSlot(idx, 'startTime', e.target.value)}
                          className="w-full px-3 py-3 md:py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Длительность</label>
                        <select
                          value={slot.durationMin}
                          onChange={(e) => updateSlot(idx, 'durationMin', Number(e.target.value))}
                          className="w-full px-3 py-3 md:py-2 border rounded-lg"
                        >
                          <option value="30">30 минут</option>
                          <option value="45">45 минут</option>
                          <option value="60">1 час</option>
                          <option value="90">1.5 часа</option>
                          <option value="120">2 часа</option>
                          <option value="150">2.5 часа</option>
                          <option value="180">3 часа</option>
                        </select>
                      </div>
                    </div>
                    {slot.date && slot.startTime && (
                      <p className="text-xs text-gray-500 mb-2">
                        Окончание: {calculateEndTime(slot.date, slot.startTime, slot.durationMin)}
                      </p>
                    )}
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(idx)}
                        className="text-red-600 hover:text-red-800 text-sm font-semibold"
                      >
                        Удалить слот
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={recurrence.enabled}
                  onChange={(e) => setRecurrence({ ...recurrence, enabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <Repeat className="w-4 h-4 text-indigo-600" />
                Повторять выбранный слот
              </label>

              {recurrence.enabled && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Ограничение повтора</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRecurrence({ ...recurrence, repeatMode: 'count' })}
                         className={`px-3 py-3 md:py-2 rounded-lg border text-sm font-semibold ${
                          recurrence.repeatMode === 'count'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200'
                        }`}
                      >
                        По неделям
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecurrence({ ...recurrence, repeatMode: 'date' })}
                         className={`px-3 py-3 md:py-2 rounded-lg border text-sm font-semibold ${
                          recurrence.repeatMode === 'date'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200'
                        }`}
                      >
                        До даты
                      </button>
                    </div>
                  </div>

                  {recurrence.repeatMode === 'count' ? (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Количество недель</label>
                      <input
                        type="number"
                        min="1"
                        max="260"
                        value={recurrence.repeatCount || 1}
                        onChange={(e) => setRecurrence({ ...recurrence, repeatCount: Number(e.target.value) })}
                        className="w-full px-3 py-3 md:py-2 border rounded-lg bg-white"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold mb-1">Дата окончания</label>
                      <input
                        type="date"
                        value={recurrence.repeatUntil || ''}
                        onChange={(e) => setRecurrence({ ...recurrence, repeatUntil: e.target.value })}
                        className="w-full px-3 py-3 md:py-2 border rounded-lg bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleAddClientRequest}
              disabled={
                !selectedClient ||
                slots.every(s => !s.date || !s.startTime) ||
                (recurrence.enabled && recurrence.repeatMode === 'date' && !recurrence.repeatUntil)
              }
              className="w-full flex items-center justify-center bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              Ранжировать и сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
