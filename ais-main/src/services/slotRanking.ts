import { getPublicTransportTravelTime, TravelLookupStatus } from './twoGisTravelService';

export interface ProposedSlot {
  from: string;
  to: string;
}

export interface LessonForRanking {
  id: number;
  kind?: 'lesson' | 'event';
  title?: string;
  startTime: Date;
  durationMin: number;
  location?: string | null;
  client?: {
    fullName: string;
    address?: string | null;
  };
}

export interface TimePreference {
  period: 'morning' | 'day' | 'evening';
  enabled: boolean;
  weight: number;
}

export interface PreferredTimes {
  morning?: TimePreference;
  day?: TimePreference;
  evening?: TimePreference;
}

export interface RankingWeights {
  wTime: number;
  wCompact: number;
  wWorkingDay: number;
  wPriority: number;
  wTravel: number;
}

export interface RankingConfig {
  weights: RankingWeights;
  workingDays: number[];
  preferredTimes?: PreferredTimes;
  minGapMinutes: number;
  maxGapMinutes: number;
  desiredBreakMinutes: number;
  maxTravelMinutes?: number;
  slotAddress?: string | null;
  userAddress?: string | null;
}

export interface RankingBreakdown {
  timeScore: number;
  compactScore: number;
  workingDayScore: number;
  priorityScore: number;
  travelScore: number;
}

export interface CriterionTextBreakdown {
  time?: string;
  compact?: string;
  workingDay?: string;
  priority?: string;
  travel?: string;
}

export interface ActiveCriteria {
  time: boolean;
  compact: boolean;
  workingDay: boolean;
  priority: boolean;
  travel: boolean;
}

export interface TravelLeg {
  direction: 'before' | 'after';
  source: 'lesson' | 'event' | 'user_address';
  fromAddress?: string | null;
  toAddress?: string | null;
  travelTimeMinutes: number | null;
  travelStatus: TravelLookupStatus;
  availableGapMinutes: number | null;
  desiredBreakMinutes: number;
  maxTravelMinutes: number;
  score: number;
  explanation: string;
}

export interface TravelDetails {
  score: number;
  travelTimeMinutes: number | null;
  availableGapMinutes: number | null;
  desiredBreakMinutes: number;
  maxTravelMinutes: number;
  explanation: string;
  before?: TravelLeg;
  after?: TravelLeg;
}

export interface RankedSlot extends ProposedSlot {
  score: number;
  breakdown: RankingBreakdown;
  weightedBreakdown: RankingBreakdown;
  activeCriteria: ActiveCriteria;
  criterionReasons: CriterionTextBreakdown;
  travelScore: number;
  travelTimeMinutes: number | null;
  availableGapMinutes: number | null;
  travelDetails: TravelDetails;
  explanation: string;
  hasConflict: boolean;
  conflictingLesson?: {
    id: number;
    clientName: string;
    startTime: string;
    kind?: 'lesson' | 'event';
  };
}

const DEFAULT_WEIGHTS: RankingWeights = {
  wTime: 0.3,
  wCompact: 0.3,
  wWorkingDay: 0.2,
  wPriority: 0.2,
  wTravel: 0.15,
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeWeights(weights: Partial<RankingWeights>): RankingWeights {
  const raw = {
    wTime: Number.isFinite(weights.wTime) ? Number(weights.wTime) : DEFAULT_WEIGHTS.wTime,
    wCompact: Number.isFinite(weights.wCompact) ? Number(weights.wCompact) : DEFAULT_WEIGHTS.wCompact,
    wWorkingDay: Number.isFinite(weights.wWorkingDay) ? Number(weights.wWorkingDay) : DEFAULT_WEIGHTS.wWorkingDay,
    wPriority: Number.isFinite(weights.wPriority) ? Number(weights.wPriority) : DEFAULT_WEIGHTS.wPriority,
    wTravel: Number.isFinite(weights.wTravel) ? Number(weights.wTravel) : DEFAULT_WEIGHTS.wTravel,
  };

  const sum = raw.wTime + raw.wCompact + raw.wWorkingDay + raw.wPriority + raw.wTravel;
  if (sum <= 0) return DEFAULT_WEIGHTS;

  return {
    wTime: raw.wTime / sum,
    wCompact: raw.wCompact / sum,
    wWorkingDay: raw.wWorkingDay / sum,
    wPriority: raw.wPriority / sum,
    wTravel: raw.wTravel / sum,
  };
}

function getActiveCriteria(weights: RankingWeights): ActiveCriteria {
  return {
    time: weights.wTime > 0,
    compact: weights.wCompact > 0,
    workingDay: weights.wWorkingDay > 0,
    priority: weights.wPriority > 0,
    travel: weights.wTravel > 0,
  };
}

function getLessonEnd(lesson: LessonForRanking): Date {
  return new Date(lesson.startTime.getTime() + lesson.durationMin * 60 * 1000);
}

function getBusyItemAddress(item: LessonForRanking | null): string | null | undefined {
  if (!item) return null;
  return item.kind === 'event' ? item.location : item.client?.address;
}

function getBusyItemName(item: LessonForRanking): string {
  return item.kind === 'event'
    ? item.title || 'личным событием'
    : item.client?.fullName || 'другим клиентом';
}

function findConflict(slotStart: Date, slotEnd: Date, lessons: LessonForRanking[]): LessonForRanking | null {
  return lessons.find((lesson) => {
    const lessonEnd = getLessonEnd(lesson);
    return slotStart < lessonEnd && slotEnd > lesson.startTime;
  }) || null;
}

function calculateTimeScore(slotStart: Date, preferredTimes?: PreferredTimes, now = new Date()): number {
  const diffDays = (slotStart.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  const soonScore = clamp(1 - Math.max(0, diffDays) / 30);
  const timeOfDayScore = calculateTimeOfDayScore(slotStart, preferredTimes);

  return clamp(soonScore * 0.75 + timeOfDayScore * 0.25);
}

function calculateTimeOfDayScore(date: Date, preferredTimes?: PreferredTimes): number {
  const hour = date.getHours();
  const period =
    hour >= 6 && hour < 12 ? preferredTimes?.morning :
    hour >= 12 && hour < 18 ? preferredTimes?.day :
    hour >= 18 && hour < 23 ? preferredTimes?.evening :
    undefined;

  if (!period?.enabled) return 0.5;
  return clamp(period.weight);
}

function calculateCompactScore(
  slotStart: Date,
  slotEnd: Date,
  lessons: LessonForRanking[],
  minGapMinutes: number,
  maxGapMinutes: number
): number {
  if (lessons.length === 0) return 0.5;

  const minGap = Math.max(1, minGapMinutes);
  const maxGap = Math.max(minGap, maxGapMinutes);
  let bestScore = 0;

  for (const lesson of lessons) {
    const lessonEnd = getLessonEnd(lesson);
    const gapBefore = (slotStart.getTime() - lessonEnd.getTime()) / 60000;
    const gapAfter = (lesson.startTime.getTime() - slotEnd.getTime()) / 60000;
    const availableGaps = [gapBefore, gapAfter].filter(gap => gap >= 0);

    for (const gap of availableGaps) {
      let score: number;

      if (gap < minGap) {
        score = 0.35 + (gap / minGap) * 0.25;
      } else if (gap <= maxGap) {
        score = 1;
      } else {
        const excess = gap - maxGap;
        score = Math.max(0.25, 1 - excess / (maxGap * 3));
      }

      bestScore = Math.max(bestScore, score);
    }
  }

  return clamp(bestScore || 0.25);
}

function calculateWorkingDayScore(date: Date, workingDays: number[]): number {
  return workingDays.includes(date.getDay()) ? 1 : 0.25;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function findAdjacentLessons(
  slotStart: Date,
  slotEnd: Date,
  lessons: LessonForRanking[]
): { previous: LessonForRanking | null; next: LessonForRanking | null } {
  let previous: LessonForRanking | null = null;
  let next: LessonForRanking | null = null;

  for (const lesson of lessons) {
    if (!isSameCalendarDay(slotStart, lesson.startTime)) continue;

    const lessonEnd = getLessonEnd(lesson);

    if (lessonEnd <= slotStart) {
      if (!previous || lessonEnd > getLessonEnd(previous)) {
        previous = lesson;
      }
    }

    if (lesson.startTime >= slotEnd) {
      if (!next || lesson.startTime < next.startTime) {
        next = lesson;
      }
    }
  }

  return { previous, next };
}

function calculateTravelScore(
  availableGapMinutes: number,
  travelTimeMinutes: number | null,
  desiredBreakMinutes: number,
  maxTravelMinutes: number
): number {
  if (travelTimeMinutes === null) return 0.3;
  if (availableGapMinutes < travelTimeMinutes) return 0;

  const gapScore = desiredBreakMinutes <= 0 || availableGapMinutes >= travelTimeMinutes + desiredBreakMinutes
    ? 1
    : clamp((availableGapMinutes - travelTimeMinutes) / desiredBreakMinutes);
  const durationScore = calculateTravelDurationScore(travelTimeMinutes, maxTravelMinutes);

  return clamp(gapScore * durationScore);
}

function calculateTravelDurationScore(
  travelTimeMinutes: number | null,
  maxTravelMinutes: number
): number {
  if (travelTimeMinutes === null) return 0.3;
  if (maxTravelMinutes <= 0 || travelTimeMinutes <= maxTravelMinutes) return 1;

  return clamp(Math.pow(maxTravelMinutes / travelTimeMinutes, 2), 0.1, 1);
}

function explainTravelLeg(
  direction: 'before' | 'after',
  source: 'lesson' | 'event' | 'user_address',
  availableGapMinutes: number | null,
  travelTimeMinutes: number | null,
  travelStatus: TravelLookupStatus,
  desiredBreakMinutes: number,
  maxTravelMinutes: number,
  score: number,
  hasAddresses: boolean
): string {
  if (travelStatus === 'missing_api_key') {
    return 'Не задан TWO_GIS_API_KEY, расчет дороги через 2GIS отключен';
  }

  if (source === 'user_address') {
    if (!hasAddresses) {
      return 'Нет адреса преподавателя или клиента для расчета дороги к первому занятию';
    }

    if (travelStatus === 'geocode_from_failed') {
      return '2GIS не распознал адрес преподавателя для расчета дороги к первому занятию';
    }

    if (travelStatus === 'geocode_to_failed') {
      return '2GIS не распознал адрес клиента для расчета дороги к первому занятию';
    }

    if (travelStatus === 'route_error') {
      return 'Ошибка запроса к 2GIS при расчете дороги к первому занятию, применен fallback';
    }

    if (travelStatus === 'route_not_found' || travelTimeMinutes === null) {
      return '2GIS не нашел маршрут от адреса преподавателя к первому занятию, применен fallback';
    }

    if (travelStatus === 'same_address') {
      return 'Первое занятие по тому же адресу, дорога не требуется';
    }

    if (maxTravelMinutes > 0 && travelTimeMinutes > maxTravelMinutes) {
      return `Первое занятие далеко: дорога около ${travelTimeMinutes} мин, желаемый максимум ${maxTravelMinutes} мин`;
    }

    return `Первое занятие: дорога от адреса преподавателя займет около ${travelTimeMinutes} мин`;
  }

  const itemLabel = source === 'event' ? 'события' : 'занятия';
  const label = direction === 'before' ? `после предыдущего ${itemLabel}` : `до следующего ${itemLabel}`;

  if (!hasAddresses) {
    return `Нет адреса для расчета дороги ${label}`;
  }

  if (travelStatus === 'geocode_from_failed') {
    return `2GIS не распознал исходный адрес для расчета дороги ${label}`;
  }

  if (travelStatus === 'geocode_to_failed') {
    return `2GIS не распознал адрес назначения для расчета дороги ${label}`;
  }

  if (travelStatus === 'route_error') {
    return `Ошибка запроса к 2GIS при расчете дороги ${label}, применен fallback`;
  }

  if (travelStatus === 'route_not_found' || travelTimeMinutes === null) {
    return `2GIS не нашел маршрут ${label}, применен fallback`;
  }

  if (travelStatus === 'same_address') {
    return `Занятия по тому же адресу ${label}, дорога не требуется`;
  }

  if (score === 0) {
    return `Недостаточно времени на дорогу ${label}: окно ${Math.round(availableGapMinutes ?? 0)} мин, дорога ${travelTimeMinutes} мин`;
  }

  if (maxTravelMinutes > 0 && travelTimeMinutes > maxTravelMinutes) {
    return `Дорога ${label} слишком долгая: ${travelTimeMinutes} мин при желаемом максимуме ${maxTravelMinutes} мин`;
  }

  if (score >= 1) {
    return `Дорога ${label} комфортная: ${travelTimeMinutes} мин и перерыв не меньше ${desiredBreakMinutes} мин`;
  }

  return `Дорога ${label} возможна, но перерыв короткий: окно ${Math.round(availableGapMinutes ?? 0)} мин, дорога ${travelTimeMinutes} мин`;
}

async function buildTravelLeg(
  direction: 'before' | 'after',
  source: 'lesson' | 'event' | 'user_address',
  fromAddress: string | null | undefined,
  toAddress: string | null | undefined,
  availableGapMinutes: number | null,
  desiredBreakMinutes: number,
  maxTravelMinutes: number,
  departureAt: Date
): Promise<TravelLeg> {
  const hasAddresses = Boolean(fromAddress?.trim() && toAddress?.trim());
  const travelLookup = hasAddresses
    ? await getPublicTransportTravelTime(fromAddress, toAddress, departureAt)
    : { travelTimeMinutes: null, status: 'missing_address' as TravelLookupStatus };
  const travelTimeMinutes = travelLookup.travelTimeMinutes;
  const score = source === 'user_address'
    ? calculateTravelDurationScore(travelTimeMinutes, maxTravelMinutes)
    : calculateTravelScore(availableGapMinutes ?? 0, travelTimeMinutes, desiredBreakMinutes, maxTravelMinutes);

  return {
    direction,
    source,
    fromAddress,
    toAddress,
    travelTimeMinutes,
    travelStatus: travelLookup.status,
    availableGapMinutes: availableGapMinutes === null ? null : Math.round(availableGapMinutes),
    desiredBreakMinutes,
    maxTravelMinutes,
    score,
    explanation: explainTravelLeg(
      direction,
      source,
      availableGapMinutes,
      travelTimeMinutes,
      travelLookup.status,
      desiredBreakMinutes,
      maxTravelMinutes,
      score,
      hasAddresses
    ),
  };
}

async function calculateTravelDetails(
  slotStart: Date,
  slotEnd: Date,
  lessons: LessonForRanking[],
  slotAddress: string | null | undefined,
  userAddress: string | null | undefined,
  desiredBreakMinutes: number,
  maxTravelMinutes: number
): Promise<TravelDetails> {
  const { previous, next } = findAdjacentLessons(slotStart, slotEnd, lessons);
  const legs: TravelLeg[] = [];

  if (previous) {
    const previousEnd = getLessonEnd(previous);
    legs.push(await buildTravelLeg(
      'before',
      previous.kind === 'event' ? 'event' : 'lesson',
      getBusyItemAddress(previous),
      slotAddress,
      (slotStart.getTime() - previousEnd.getTime()) / 60000,
      desiredBreakMinutes,
      maxTravelMinutes,
      previousEnd
    ));
  } else if (userAddress?.trim()) {
    legs.push(await buildTravelLeg(
      'before',
      'user_address',
      userAddress,
      slotAddress,
      null,
      desiredBreakMinutes,
      maxTravelMinutes,
      slotStart
    ));
  }

  if (next) {
    legs.push(await buildTravelLeg(
      'after',
      next.kind === 'event' ? 'event' : 'lesson',
      slotAddress,
      getBusyItemAddress(next),
      (next.startTime.getTime() - slotEnd.getTime()) / 60000,
      desiredBreakMinutes,
      maxTravelMinutes,
      slotEnd
    ));
  }

  if (legs.length === 0) {
    return {
      score: 1,
      travelTimeMinutes: null,
      availableGapMinutes: null,
      desiredBreakMinutes,
      maxTravelMinutes,
      explanation: 'Единственное занятие в этот день: дорога между занятиями не ограничивает слот',
    };
  }

  const limitingLeg = legs.reduce((worst, leg) => (leg.score < worst.score ? leg : worst), legs[0]);
  const details: TravelDetails = {
    score: limitingLeg.score,
    travelTimeMinutes: limitingLeg.travelTimeMinutes,
    availableGapMinutes: limitingLeg.availableGapMinutes,
    desiredBreakMinutes,
    maxTravelMinutes,
    explanation: limitingLeg.explanation,
  };

  for (const leg of legs) {
    if (leg.direction === 'before') details.before = leg;
    if (leg.direction === 'after') details.after = leg;
  }

  return details;
}

function generateExplanation(
  breakdown: RankingBreakdown,
  isVip: boolean,
  conflict: LessonForRanking | null,
  travelDetails: TravelDetails
): string {
  if (conflict) {
    return conflict.kind === 'event'
      ? `Конфликт: время занято событием ${getBusyItemName(conflict)}`
      : `Конфликт: время занято клиентом ${getBusyItemName(conflict)}`;
  }

  const reasons: string[] = [];

  if (breakdown.timeScore >= 0.8) reasons.push('скоро и в удобное время');
  else if (breakdown.timeScore < 0.45) reasons.push('далеко по дате или неудачное время дня');

  if (breakdown.compactScore >= 0.8) reasons.push('хорошо заполняет расписание');
  else if (breakdown.compactScore < 0.45) reasons.push('создает большое окно');

  if (breakdown.workingDayScore >= 0.9) reasons.push('рабочий день');
  else reasons.push('нерабочий день');

  if (isVip) reasons.push('VIP клиент');
  reasons.push(travelDetails.explanation);

  return reasons.join(', ') || 'нейтральный слот';
}

function getTimeReason(score: number) {
  if (score >= 0.8) return 'Скоро и в удобное время.';
  if (score < 0.45) return 'Далеко по дате или неудачное время дня.';
  return 'Нормальное время без сильного преимущества.';
}

function getCompactReason(score: number) {
  if (score >= 0.8) return 'Хорошо заполняет расписание.';
  if (score < 0.45) return 'Создает большое окно.';
  return 'Средняя компактность расписания.';
}

function getWorkingDayReason(score: number) {
  return score >= 0.9 ? 'Рабочий день.' : 'Нерабочий день.';
}

function buildCriterionReasons(
  breakdown: RankingBreakdown,
  isVip: boolean,
  travelDetails: TravelDetails
): CriterionTextBreakdown {
  return {
    time: getTimeReason(breakdown.timeScore),
    compact: getCompactReason(breakdown.compactScore),
    workingDay: getWorkingDayReason(breakdown.workingDayScore),
    priority: isVip ? 'Клиент отмечен как VIP.' : undefined,
    travel: `${travelDetails.explanation}.`,
  };
}

function buildWeightedBreakdown(
  breakdown: RankingBreakdown,
  weights: RankingWeights,
  isVip: boolean,
  travelDetails: TravelDetails
): RankingBreakdown {
  return {
    timeScore: roundScore(weights.wTime * breakdown.timeScore * 100),
    compactScore: roundScore(weights.wCompact * breakdown.compactScore * 100),
    workingDayScore: roundScore(weights.wWorkingDay * breakdown.workingDayScore * 100),
    priorityScore: roundScore(isVip ? weights.wPriority * breakdown.priorityScore * 100 : 0),
    travelScore: roundScore(weights.wTravel * breakdown.travelScore * 100),
  };
}

export async function rankSlots(
  proposedSlots: ProposedSlot[],
  lessons: LessonForRanking[],
  config: RankingConfig,
  clientVip: boolean
): Promise<RankedSlot[]> {
  const weights = normalizeWeights(config.weights);
  const activeCriteria = getActiveCriteria(weights);

  const rankedSlots = await Promise.all(proposedSlots.map(async (slot) => {
    const slotStart = new Date(slot.from);
    const slotEnd = new Date(slot.to);
    const conflict = findConflict(slotStart, slotEnd, lessons);
    const travelDetails = await calculateTravelDetails(
      slotStart,
      slotEnd,
      lessons,
      config.slotAddress,
      config.userAddress,
      Math.max(0, config.desiredBreakMinutes),
      Math.max(0, config.maxTravelMinutes ?? 60)
    );

    const breakdown: RankingBreakdown = {
      timeScore: calculateTimeScore(slotStart, config.preferredTimes),
      compactScore: calculateCompactScore(
        slotStart,
        slotEnd,
        lessons,
        config.minGapMinutes,
        config.maxGapMinutes
      ),
      workingDayScore: calculateWorkingDayScore(slotStart, config.workingDays),
      priorityScore: clientVip ? 1 : 0.5,
      travelScore: travelDetails.score,
    };

    const weightedScore =
      weights.wTime * breakdown.timeScore +
      weights.wCompact * breakdown.compactScore +
      weights.wWorkingDay * breakdown.workingDayScore +
      weights.wPriority * breakdown.priorityScore +
      weights.wTravel * breakdown.travelScore;

    const finalScore = conflict ? weightedScore * 0.1 : weightedScore;
    const weightedBreakdown = buildWeightedBreakdown(breakdown, weights, clientVip, travelDetails);

    return {
      ...slot,
      score: roundScore(finalScore * 100),
      breakdown: {
        timeScore: roundScore(breakdown.timeScore),
        compactScore: roundScore(breakdown.compactScore),
        workingDayScore: roundScore(breakdown.workingDayScore),
        priorityScore: roundScore(breakdown.priorityScore),
        travelScore: roundScore(breakdown.travelScore),
      },
      weightedBreakdown,
      activeCriteria,
      criterionReasons: buildCriterionReasons(breakdown, clientVip, travelDetails),
      travelScore: roundScore(breakdown.travelScore),
      travelTimeMinutes: travelDetails.travelTimeMinutes,
      availableGapMinutes: travelDetails.availableGapMinutes,
      travelDetails: {
        ...travelDetails,
        score: roundScore(travelDetails.score),
        before: travelDetails.before ? {
          ...travelDetails.before,
          score: roundScore(travelDetails.before.score),
        } : undefined,
        after: travelDetails.after ? {
          ...travelDetails.after,
          score: roundScore(travelDetails.after.score),
        } : undefined,
      },
      explanation: generateExplanation(breakdown, clientVip, conflict, travelDetails),
      hasConflict: Boolean(conflict),
      conflictingLesson: conflict ? {
        id: conflict.id,
        clientName: getBusyItemName(conflict),
        startTime: conflict.startTime.toISOString(),
        kind: conflict.kind,
      } : undefined,
    };
  }));

  return rankedSlots.sort((a, b) => b.score - a.score);
}
