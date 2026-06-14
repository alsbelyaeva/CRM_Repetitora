import { Router } from 'express';
import * as ctrl from '../controllers/lessonsController';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { logAuditAction } from '../services/auditLogService';

const router = Router();
const prisma = new PrismaClient();

function getLessonStatusAuditAction(oldStatus: string | null | undefined, newStatus: string) {
  if (newStatus === 'CANCELLED') return 'lesson.cancel';
  if (oldStatus === 'CANCELLED' && newStatus === 'PLANNED') return 'lesson.restore';
  if (oldStatus && oldStatus !== newStatus) return 'lesson.status.update';
  return 'lesson.update';
}

function normalizeSlot(slot: any, fallbackStatus = 'PENDING') {
  if (!slot || typeof slot !== 'object') return slot;
  return {
    ...slot,
    status: typeof slot.status === 'string' ? slot.status : fallbackStatus,
  };
}

function slotMatchesLesson(slot: any, lesson: { startTime: Date; durationMin: number }) {
  if (!slot?.from || !slot?.to) return false;

  const slotStart = new Date(slot.from);
  const slotEnd = new Date(slot.to);
  const lessonStart = new Date(lesson.startTime);
  const lessonEnd = new Date(lessonStart.getTime() + lesson.durationMin * 60 * 1000);

  return slotStart.getTime() === lessonStart.getTime() && slotEnd.getTime() === lessonEnd.getTime();
}

function getCancelledSlots(proposedSlots: any, requestStatus?: string) {
  if (!Array.isArray(proposedSlots)) return [];

  const normalizedSlots = proposedSlots.map(slot => normalizeSlot(slot));
  return requestStatus === 'CANCELLED'
    ? normalizedSlots
    : normalizedSlots.filter(slot => slot?.status === 'CANCELLED');
}

async function syncCancelledSlotRequestsToLessons(userId?: string) {
  const requests = await prisma.slotRequest.findMany({
    where: {
      ...(userId ? { userId } : {}),
    },
  });

  for (const request of requests) {
    const cancelledSlots = getCancelledSlots(request.proposedSlots, request.status);
    if (cancelledSlots.length === 0) continue;

    const plannedLessons = await prisma.lesson.findMany({
      where: {
        userId: request.userId,
        clientId: request.clientId,
        status: 'PLANNED',
      },
    });

    const lessonIdsToCancel = plannedLessons
      .filter(lesson => cancelledSlots.some(slot => slotMatchesLesson(slot, lesson)))
      .map(lesson => lesson.id);

    if (lessonIdsToCancel.length > 0) {
      await prisma.lesson.updateMany({
        where: { id: { in: lessonIdsToCancel } },
        data: { status: 'CANCELLED' },
      });
    }
  }
}

function getLessonEnd(lesson: { startTime: Date; durationMin: number }) {
  return new Date(new Date(lesson.startTime).getTime() + lesson.durationMin * 60 * 1000);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isFutureCalendarDay(date: Date) {
  return startOfLocalDay(date).getTime() > startOfLocalDay(new Date()).getTime();
}

function isPastCalendarDay(date: Date) {
  return startOfLocalDay(date).getTime() < startOfLocalDay(new Date()).getTime();
}

function lessonsOverlap(
  startTime: Date,
  durationMin: number,
  lesson: { startTime: Date; durationMin: number }
) {
  const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000);
  return startTime < getLessonEnd(lesson) && new Date(lesson.startTime) < endTime;
}

function getIsoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function buildDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function generateWeeklyOccurrences(options: {
  startDate: string;
  endDate?: string;
  repeatCount?: number;
  weekday: number;
  startTime: string;
}) {
  const startDate = parseDateOnly(options.startDate);
  const endDate = options.endDate ? parseDateOnly(options.endDate) : null;

  if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
    return null;
  }

  const occurrences: Date[] = [];
  const current = new Date(startDate);
  const daysToAdd = (options.weekday - getIsoWeekday(current) + 7) % 7;
  current.setDate(current.getDate() + daysToAdd);

  const maxCount = Math.min(Math.max(Number(options.repeatCount || 0), 0) || 260, 260);
  while (occurrences.length < maxCount) {
    if (endDate && current > endDate) break;
    occurrences.push(buildDateTime(current, options.startTime));
    if (!endDate && options.repeatCount && occurrences.length >= options.repeatCount) break;
    current.setDate(current.getDate() + 7);
  }

  return occurrences;
}

function describeLessonConflict(lesson: any) {
  const start = new Date(lesson.startTime);
  const end = getLessonEnd(lesson);
  return {
    lessonId: lesson.id,
    clientName: lesson.client?.fullName || 'Клиент',
    startTime: start,
    endTime: end,
  };
}

function describeBusyConflictMessage(conflict: any, prefix = 'Это время пересекается') {
  if (conflict?.isScheduleEvent) {
    return `${prefix} с событием: ${conflict.client?.fullName || 'личное событие'}`;
  }

  return `${prefix} с занятием клиента ${conflict?.client?.fullName || 'другого клиента'}`;
}

function normalizeParticipantClientIds(clientId: unknown, participantClientIds: unknown) {
  const ids = Array.isArray(participantClientIds)
    ? participantClientIds
    : participantClientIds !== undefined && participantClientIds !== null
      ? [participantClientIds]
      : [];

  const normalized = ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const primaryId = Number(clientId);

  if (Number.isInteger(primaryId) && primaryId > 0) {
    normalized.unshift(primaryId);
  }

  return Array.from(new Set(normalized));
}

async function validateLessonParticipants(options: {
  user: any;
  clientId: number;
  participantClientIds?: unknown;
  assignedTeacherId?: string;
  expectedUserId?: string | null;
}) {
  const participantIds = normalizeParticipantClientIds(options.clientId, options.participantClientIds);
  if (participantIds.length === 0) {
    return { error: 'Не выбран клиент занятия' };
  }

  const clients = await prisma.client.findMany({
    where: {
      id: { in: participantIds },
      ...(options.user.role === 'ADMIN'
        ? options.assignedTeacherId
          ? { userId: options.assignedTeacherId }
          : options.expectedUserId
            ? { userId: options.expectedUserId }
            : {}
        : { userId: options.user.id }),
    },
    select: {
      id: true,
      fullName: true,
      userId: true,
    },
  });

  if (clients.length !== participantIds.length) {
    return { error: 'Один или несколько клиентов не найдены или недоступны' };
  }

  const ownerIds = Array.from(new Set(clients.map(client => client.userId)));
  if (ownerIds.length !== 1) {
    return { error: 'Все участники группового занятия должны относиться к одному преподавателю' };
  }

  return {
    participantIds,
    clients,
    targetUserId: options.user.role === 'ADMIN' ? ownerIds[0] : options.user.id,
  };
}

const lessonParticipantsInclude = {
  participants: {
    include: {
      client: {
        select: {
          id: true,
          fullName: true,
          address: true,
        },
      },
    },
    orderBy: {
      id: 'asc' as const,
    },
  },
};

function formatConflictDateTime(conflict: any) {
  const occurrence = new Date(conflict.occurrence);
  return `${occurrence.toLocaleDateString('ru-RU')} ${conflict.time || formatTimeValue(occurrence)}`;
}

function buildRecurringConflictSlot(conflict: any, durationMin: number, recurringSeriesId: number) {
  const from = new Date(conflict.occurrence);
  const to = new Date(from.getTime() + durationMin * 60 * 1000);
  const isEventConflict = Boolean(conflict.eventId);
  const conflictName = conflict.clientName || (isEventConflict ? 'личное событие' : 'другой клиент');

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    score: 0,
    breakdown: {
      timeScore: 0,
      compactScore: 0,
      workingDayScore: 0,
      priorityScore: 0,
      travelScore: 0,
    },
    weightedBreakdown: {
      timeScore: 0,
      compactScore: 0,
      workingDayScore: 0,
      priorityScore: 0,
      travelScore: 0,
    },
    activeCriteria: {
      time: true,
      compact: true,
      workingDay: true,
      priority: true,
      travel: true,
    },
    criterionReasons: {},
    status: 'PENDING',
    travelScore: 0,
    travelTimeMinutes: null,
    availableGapMinutes: null,
    explanation: isEventConflict
      ? `Конфликт: время занято событием ${conflictName}`
      : `Конфликт: время занято клиентом ${conflictName}`,
    hasConflict: true,
    recurringSeriesId,
    recurringConflict: true,
    conflictingLesson: {
      id: isEventConflict ? conflict.eventId : conflict.lessonId,
      clientName: conflictName,
      startTime: new Date(conflict.startTime || conflict.occurrence).toISOString(),
      kind: isEventConflict ? 'event' : 'lesson',
    },
  };
}

async function createRecurringConflictSlotRequest(options: {
  clientId: number;
  userId: string;
  conflicts: any[];
  durationMin: number;
  recurringSeriesId: number;
}) {
  if (options.conflicts.length === 0) return null;

  return prisma.slotRequest.create({
    data: {
      clientId: options.clientId,
      userId: options.userId,
      status: 'PENDING',
      proposedSlots: options.conflicts.map(conflict => (
        buildRecurringConflictSlot(conflict, options.durationMin, options.recurringSeriesId)
      )),
    },
  });
}

async function getLessonAccess(id: number, user: any) {
  return prisma.lesson.findFirst({
    where: user.role === 'ADMIN' ? { id } : { id, userId: user.id },
    include: {
      client: {
        select: {
          id: true,
          fullName: true,
          address: true,
        },
      },
      ...lessonParticipantsInclude,
    },
  });
}

async function findConflictsForOccurrences(
  userId: string,
  occurrences: Date[],
  durationMin: number,
  excludeLessonIds: number[] = []
) {
  if (occurrences.length === 0) return [];

  const lastEnd = new Date(Math.max(...occurrences.map(date => date.getTime())) + durationMin * 60 * 1000);
  const [plannedLessons, activeEvents] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        userId,
        status: 'PLANNED',
        startTime: {
          lt: lastEnd,
        },
        ...(excludeLessonIds.length > 0 ? { id: { notIn: excludeLessonIds } } : {}),
      },
      include: {
        client: {
          select: {
            fullName: true,
          },
        },
      },
    }),
    prisma.scheduleEvent.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        startTime: {
          lt: lastEnd,
        },
      },
    }),
  ]);

  return occurrences.flatMap((occurrence) => {
    const lessonConflict = plannedLessons.find(lesson => lessonsOverlap(occurrence, durationMin, lesson));
    if (lessonConflict) {
      return [{
        occurrence: occurrence,
        date: formatDateOnly(occurrence),
        time: occurrence.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        ...describeLessonConflict(lessonConflict),
      }];
    }

    const eventConflict = activeEvents.find(event => lessonsOverlap(occurrence, durationMin, event));
    return eventConflict
      ? [{
          occurrence: occurrence,
          date: formatDateOnly(occurrence),
          time: occurrence.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          lessonId: null,
          eventId: eventConflict.id,
          clientName: eventConflict.title,
          startTime: eventConflict.startTime,
          endTime: getLessonEnd(eventConflict),
        }]
      : [];
  });
}

async function findPlannedLessonConflict(
  userId: string,
  startTime: Date,
  durationMin: number,
  excludeLessonId?: number
) {
  const [plannedLessons, activeEvents] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        userId,
        status: 'PLANNED',
        ...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
      },
      include: {
        client: {
          select: {
            fullName: true,
          },
        },
      },
    }),
    prisma.scheduleEvent.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
    }),
  ]);

  const lessonConflict = plannedLessons.find(lesson => lessonsOverlap(startTime, durationMin, lesson));
  if (lessonConflict) return lessonConflict;

  const eventConflict = activeEvents.find(event => lessonsOverlap(startTime, durationMin, event));
  return eventConflict
    ? {
        ...eventConflict,
        client: { fullName: eventConflict.title },
        isScheduleEvent: true,
      }
    : null;
}

function getRequestStatusAfterSlotUpdate(slots: any[], fallback = 'PENDING') {
  if (slots.length === 0) return 'CANCELLED';
  if (slots.every(slot => slot?.status === 'CANCELLED')) return 'CANCELLED';
  if (slots.some(slot => slot?.status === 'CONFIRMED' || slot?.status === 'ACCEPTED')) return 'CONFIRMED';
  return fallback === 'CANCELLED' ? 'PENDING' : fallback;
}

async function cancelMatchingSlotRequestsForLesson(lesson: {
  id: number;
  userId: string | null;
  clientId: number;
  startTime: Date;
  durationMin: number;
}) {
  if (!lesson.userId) return;

  const requests = await prisma.slotRequest.findMany({
    where: {
      userId: lesson.userId,
      clientId: lesson.clientId,
    },
  });

  await Promise.all(requests.map(async (request) => {
    const slots = Array.isArray(request.proposedSlots) ? request.proposedSlots : [];
    let changed = false;
    const updatedSlots = slots.map((slot) => {
      const normalizedSlot = normalizeSlot(slot);
      if (slotMatchesLesson(normalizedSlot, lesson) && normalizedSlot.status !== 'CANCELLED') {
        changed = true;
        return { ...normalizedSlot, status: 'CANCELLED' };
      }
      return normalizedSlot;
    });

    if (!changed) return;

    await prisma.slotRequest.update({
      where: { id: request.id },
      data: {
        proposedSlots: updatedSlots,
        status: getRequestStatusAfterSlotUpdate(updatedSlots, request.status),
      },
    });
  }));
}

// Применяем middleware авторизации ко всем роутам
router.use(authMiddleware);

// Получить все занятия (с фильтрацией по userId для преподавателей)
router.get('/', async (req, res) => {
  try {
    const user = req.user; 
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Определяем условие фильтрации в зависимости от роли
    const whereClause = user.role === 'ADMIN'
      ? (requestedUserId ? { userId: requestedUserId } : {})
      : { userId: user.id };

    await syncCancelledSlotRequestsToLessons(
      user.role === 'ADMIN' ? requestedUserId : user.id
    );

    console.log('🔍 [Lessons] Получение занятий для пользователя:', {
      userId: user.id,
      role: user.role,
      whereClause
    });

    const lessons = await prisma.lesson.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            address: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              }
            }
          },
        },
        ...lessonParticipantsInclude,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        }
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    console.log(`✅ [Lessons] Найдено занятий: ${lessons.length}`);
    res.json(lessons);
  } catch (error) {
    console.error('❌ [Lessons] Error fetching lessons:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Альтернативный роут для API
router.get('/api/lessons', async (req, res) => {
  try {
    const user = req.user;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const whereClause = user.role === 'ADMIN' 
      ? (requestedUserId ? { userId: requestedUserId } : {})
      : { userId: user.id };

    await syncCancelledSlotRequestsToLessons(
      user.role === 'ADMIN' ? requestedUserId : user.id
    );

    const lessons = await prisma.lesson.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            address: true,
          },
        },
        ...lessonParticipantsInclude,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    res.json(lessons);
  } catch (error) {
    console.error('❌ [Lessons] Error fetching lessons:', error);
    res.status(500).json({ error: 'Ошибка получения занятий' });
  }
});

// Получить статистику по занятиям (с фильтрацией)
router.get('/stats', async (req, res) => {
  try {
    const user = req.user;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const whereClause = user.role === 'ADMIN' 
      ? (requestedUserId ? { userId: requestedUserId } : {})
      : { userId: user.id };

    await syncCancelledSlotRequestsToLessons(
      user.role === 'ADMIN' ? requestedUserId : user.id
    );

    console.log('📊 [Lessons] Получение статистики для:', {
      userId: user.id,
      role: user.role
    });

    const [cancelled, done, planned] = await Promise.all([
      prisma.lesson.count({
        where: { ...whereClause, status: 'CANCELLED' },
      }),
      prisma.lesson.count({
        where: { ...whereClause, status: 'DONE' },
      }),
      prisma.lesson.count({
        where: { ...whereClause, status: 'PLANNED' },
      }),
    ]);

    res.json({
      cancelled,
      done,
      planned,
    });
  } catch (error) {
    console.error('❌ [Lessons] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Получить конкретное занятие (с проверкой доступа)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const whereClause = user.role === 'ADMIN'
      ? { id: parseInt(id) }
      : { id: parseInt(id), userId: user.id };

    console.log('🔍 [Lessons] Получение занятия:', {
      lessonId: id,
      userId: user.id,
      role: user.role
    });

    const lesson = await prisma.lesson.findFirst({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            address: true,
          },
        },
        ...lessonParticipantsInclude,
      },
    });

    if (!lesson) {
      console.log('⚠️ [Lessons] Занятие не найдено или нет доступа');
      return res.status(404).json({ 
        error: 'Lesson not found',
        message: 'Занятие не найдено или у вас нет доступа к нему'
      });
    }

    res.json(lesson);
  } catch (error) {
    console.error('❌ [Lessons] Error fetching lesson:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Создать занятие
router.post('/', async (req, res) => {
  try {
    const { clientId, participantClientIds, startTime, durationMin, type, status, notes, userId: assignedTeacherId } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    console.log('➕ [Lessons] Создание занятия:', {
      clientId,
      userId: user.id,
      role: user.role
    });

    // Валидация
    if (!clientId || !startTime || !durationMin || !type) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Заполните все обязательные поля',
      });
    }

    const participantValidation = await validateLessonParticipants({
      user,
      clientId: Number(clientId),
      participantClientIds,
      assignedTeacherId,
    });

    if ('error' in participantValidation) {
      return res.status(404).json({
        error: 'Client not found',
        message: participantValidation.error,
      });
    }

    const { participantIds, clients: lessonClients, targetUserId } = participantValidation;
    const normalizedStartTime = new Date(startTime);
    const normalizedDuration = Number(durationMin);

    if (Number.isNaN(normalizedStartTime.getTime()) || !Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
      return res.status(400).json({
        error: 'Invalid lesson time',
        message: 'Некорректные время или длительность занятия',
      });
    }

    const nextStatus = isPastCalendarDay(normalizedStartTime) && (status || 'PLANNED') === 'PLANNED'
      ? 'DONE'
      : (status || 'PLANNED');

    if (nextStatus === 'PLANNED') {
      const conflict = await findPlannedLessonConflict(targetUserId, normalizedStartTime, normalizedDuration);
      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: describeBusyConflictMessage(conflict),
          conflictingLesson: {
            id: conflict.id,
            clientName: conflict.client?.fullName,
            startTime: conflict.startTime,
          },
        });
      }
    }

    // Создание занятия (автоматически привязываем к текущему пользователю)
    const lesson = await prisma.lesson.create({
      data: {
        clientId: Number(clientId),
        startTime: normalizedStartTime,
        durationMin: normalizedDuration,
        type,
        status: nextStatus,
        notes: notes || null,
        userId: targetUserId,
        participants: {
          create: participantIds.map((participantClientId) => ({
            clientId: participantClientId,
          })),
        },
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            address: true,
          },
        },
        ...lessonParticipantsInclude,
      },
    });

    console.log('✅ [Lessons] Занятие создано:', lesson.id);

    await logAuditAction({
      userId: lesson.userId,
      action: 'lesson.create',
      entity: 'Lesson',
      entityId: lesson.id,
      details: {
        clientId: lesson.clientId,
        clientName: lesson.client?.fullName,
        participantClientIds: participantIds,
        participantNames: lessonClients.map(client => client.fullName),
        startTime: lesson.startTime,
        durationMin: lesson.durationMin,
        status: lesson.status,
        type: lesson.type,
        createdBy: user.id,
      },
    });

    res.status(201).json(lesson);
  } catch (error) {
    console.error('❌ [Lessons] Error creating lesson:', error);
    res.status(500).json({
      error: 'Failed to create lesson',
      message: 'Ошибка при создании занятия',
    });
  }
});

router.post('/recurring-series', async (req, res) => {
  try {
    const {
      clientId,
      participantClientIds,
      weekday,
      startTime,
      durationMin,
      startDate,
      endDate,
      repeatCount,
      type,
      notes,
      userId: assignedTeacherId,
    } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const normalizedWeekday = Number(weekday);
    const normalizedDuration = Number(durationMin);
    const normalizedRepeatCount = repeatCount ? Number(repeatCount) : undefined;

    if (
      !clientId ||
      !startTime ||
      !startDate ||
      !type ||
      !Number.isInteger(normalizedWeekday) ||
      normalizedWeekday < 1 ||
      normalizedWeekday > 7 ||
      !Number.isFinite(normalizedDuration) ||
      normalizedDuration <= 0
    ) {
      return res.status(400).json({
        error: 'Invalid recurring lesson data',
        message: 'Заполните клиента, день недели, время, длительность, дату начала и тип занятия',
      });
    }

    if (!endDate && (!normalizedRepeatCount || normalizedRepeatCount <= 0)) {
      return res.status(400).json({
        error: 'Missing recurrence limit',
        message: 'Укажите дату окончания или количество повторений',
      });
    }

    if (normalizedRepeatCount && normalizedRepeatCount > 260) {
      return res.status(400).json({
        error: 'Too many occurrences',
        message: 'Количество повторений не должно превышать 260 недель',
      });
    }

    const participantValidation = await validateLessonParticipants({
      user,
      clientId: Number(clientId),
      participantClientIds,
      assignedTeacherId,
    });

    if ('error' in participantValidation) {
      return res.status(404).json({
        error: 'Client not found',
        message: participantValidation.error,
      });
    }

    const { participantIds, targetUserId } = participantValidation;
    const occurrences = generateWeeklyOccurrences({
      startDate,
      endDate,
      repeatCount: normalizedRepeatCount,
      weekday: normalizedWeekday,
      startTime,
    });

    if (!occurrences || occurrences.length === 0) {
      return res.status(400).json({
        error: 'No occurrences',
        message: 'По выбранным параметрам не получилось создать ни одной даты',
      });
    }

    const conflicts = await findConflictsForOccurrences(targetUserId, occurrences, normalizedDuration);
    const conflictTimes = new Set(conflicts.map(conflict => conflict.occurrence.getTime()));
    const availableOccurrences = occurrences.filter(occurrence => !conflictTimes.has(occurrence.getTime()));

    const series = await prisma.recurringSeries.create({
      data: {
        clientId: Number(clientId),
        userId: targetUserId,
        weekday: normalizedWeekday,
        startTime,
        durationMin: normalizedDuration,
        type,
        notes: notes || null,
        startsOn: parseDateOnly(startDate),
        endsOn: endDate ? parseDateOnly(endDate) : null,
        repeatCount: normalizedRepeatCount || null,
      },
    });

    const lessons = await prisma.$transaction(
      availableOccurrences.map((occurrence) => prisma.lesson.create({
        data: {
          clientId: Number(clientId),
          userId: targetUserId,
          startTime: occurrence,
          durationMin: normalizedDuration,
          type,
          status: isPastCalendarDay(occurrence) ? 'DONE' : 'PLANNED',
          notes: notes || null,
          recurringSeriesId: series.id,
          participants: {
            create: participantIds.map((participantClientId) => ({
              clientId: participantClientId,
            })),
          },
        },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              address: true,
            },
          },
          ...lessonParticipantsInclude,
        },
      }))
    );

    const conflictSlotRequest = await createRecurringConflictSlotRequest({
      clientId: Number(clientId),
      userId: targetUserId,
      conflicts,
      durationMin: normalizedDuration,
      recurringSeriesId: series.id,
    });
    const conflictDetails = conflicts
      .slice(0, 5)
      .map(conflict => `${formatConflictDateTime(conflict)}: ${conflict.clientName || 'занято'}`)
      .join('; ');

    await logAuditAction({
      userId: targetUserId,
      action: 'lesson.recurringSeries.create',
      entity: 'RecurringSeries',
      entityId: series.id,
      details: {
        clientId: Number(clientId),
        participantClientIds: participantIds,
        createdBy: user.id,
        createdCount: lessons.length,
        conflictCount: conflicts.length,
        conflictSlotRequestId: conflictSlotRequest?.id ?? null,
        weekday: normalizedWeekday,
        startTime,
        durationMin: normalizedDuration,
      },
    });

    return res.status(conflicts.length > 0 ? 207 : 201).json({
      series,
      lessons,
      createdCount: lessons.length,
      skippedCount: conflicts.length,
      conflicts,
      conflictSlotRequest,
      conflictSlotRequestId: conflictSlotRequest?.id ?? null,
      message: conflicts.length > 0
        ? `Создано занятий: ${lessons.length}. Конфликтующие даты добавлены в запросы слотов: ${conflictDetails}.`
        : `Создано занятий: ${lessons.length}.`,
    });
  } catch (error) {
    console.error('❌ [Lessons] Error creating recurring series:', error);
    return res.status(500).json({
      error: 'Failed to create recurring series',
      message: 'Ошибка при создании регулярных занятий',
    });
  }
});
// Проверка доступности времени
router.post('/check-availability', async (req, res) => {
  try {
    const { startTime, durationMin, userId: requestedUserId } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    console.log('🔍 [Lessons] Проверка доступности времени:', {
      startTime,
      durationMin,
      userId: user.id,
      role: user.role
    });

    // Валидация
    if (!startTime || !durationMin) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Заполните время и длительность',
      });
    }

    const startTimeDate = new Date(startTime);
    if (isNaN(startTimeDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Некорректный формат даты',
      });
    }

    const endTimeDate = new Date(startTimeDate.getTime() + durationMin * 60 * 1000);
    
    // Проверяем существующие занятия пользователя
    const targetUserId = user.role === 'ADMIN' && requestedUserId ? requestedUserId : user.id;

    const [existingLessons, activeEvents] = await Promise.all([
      prisma.lesson.findMany({
        where: {
          userId: targetUserId,
          status: 'PLANNED',
        },
        include: {
          client: {
            select: {
              fullName: true,
            },
          },
        },
      }),
      prisma.scheduleEvent.findMany({
        where: {
          userId: targetUserId,
          status: 'ACTIVE',
        },
      }),
    ]);

    // Проверка на пересечения
    const conflictingLessons = [];
    
    for (const lesson of existingLessons) {
      const lessonStart = new Date(lesson.startTime);
      const lessonEnd = new Date(lessonStart.getTime() + lesson.durationMin * 60 * 1000);
      
      // Проверяем пересечение временных интервалов
      if (startTimeDate < lessonEnd && lessonStart < endTimeDate) {
        conflictingLessons.push({
          id: lesson.id,
          clientName: lesson.client.fullName,
          startTime: lessonStart,
          endTime: lessonEnd,
          duration: lesson.durationMin,
        });
      }
    }

    for (const event of activeEvents) {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(eventStart.getTime() + event.durationMin * 60 * 1000);

      if (startTimeDate < eventEnd && eventStart < endTimeDate) {
        conflictingLessons.push({
          id: event.id,
          eventId: event.id,
          clientName: event.title,
          startTime: eventStart,
          endTime: eventEnd,
          duration: event.durationMin,
          type: 'EVENT',
        });
      }
    }

    const isAvailable = conflictingLessons.length === 0;

    console.log('📊 [Lessons] Результат проверки:', {
      isAvailable,
      conflictingLessons: conflictingLessons.length,
      userId: user.id
    });

    res.json({
      available: isAvailable,
      conflictingLessons,
      message: isAvailable 
        ? '✅ Время свободно'
        : `❌ Время занято (${conflictingLessons.length} занятий)`,
    });
  } catch (error) {
    console.error('❌ [Lessons] Error checking availability:', error);
    res.status(500).json({
      error: 'Failed to check availability',
      message: 'Ошибка при проверке доступности времени',
    });
  }
});
// Обновить занятие (с проверкой доступа)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, participantClientIds, startTime, durationMin, type, status, notes, scope = 'single' } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    console.log('✏️ [Lessons] Обновление занятия:', {
      lessonId: id,
      userId: user.id,
      role: user.role
    });

    // Проверка существования занятия и доступа к нему
    const whereClause = user.role === 'ADMIN'
      ? { id: parseInt(id) }
      : { id: parseInt(id), userId: user.id };

    const existingLesson = await prisma.lesson.findFirst({
      where: whereClause,
    });

    if (!existingLesson) {
      console.log('⚠️ [Lessons] Занятие не найдено или нет доступа');
      return res.status(404).json({
        error: 'Lesson not found',
        message: 'Занятие не найдено или у вас нет доступа к нему',
      });
    }

    const nextClientId = clientId !== undefined ? Number(clientId) : existingLesson.clientId;
    let nextParticipantIds: number[] | undefined;
    let nextParticipantNames: string[] | undefined;

    if (clientId !== undefined || participantClientIds !== undefined) {
      const validation = await validateLessonParticipants({
        user,
        clientId: nextClientId,
        participantClientIds,
        expectedUserId: existingLesson.userId,
      });

      if ('error' in validation) {
        return res.status(404).json({
          error: 'Client not found',
          message: validation.error,
        });
      }

      nextParticipantIds = validation.participantIds;
      nextParticipantNames = validation.clients.map(client => client.fullName);
    }

    if (existingLesson.recurringSeriesId && scope !== 'single') {
      const targetLessons = await prisma.lesson.findMany({
        where: scope === 'future'
          ? {
              recurringSeriesId: existingLesson.recurringSeriesId,
              startTime: { gte: existingLesson.startTime },
            }
          : {
              recurringSeriesId: existingLesson.recurringSeriesId,
            },
        orderBy: { startTime: 'asc' },
      });
      const targetIds = targetLessons.map(lesson => lesson.id);
      const nextDurationMin = durationMin !== undefined ? Number(durationMin) : existingLesson.durationMin;
      const selectedLessonIndex = Math.max(
        targetLessons.findIndex(lesson => lesson.id === existingLesson.id),
        0
      );
      const selectedNewStart = startTime !== undefined ? new Date(startTime) : null;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const nextStarts = targetLessons.map((lesson, index) => (
        selectedNewStart
          ? new Date(selectedNewStart.getTime() + (index - selectedLessonIndex) * weekMs)
          : lesson.startTime
      ));

      if (startTime !== undefined && nextStarts.some(date => Number.isNaN(date.getTime()))) {
        return res.status(400).json({
          error: 'Invalid lesson time',
          message: 'Некорректное время занятия',
        });
      }

      const nextStatus = status ?? existingLesson.status;
      if (nextStatus === 'PLANNED' && nextStarts.some(date => isPastCalendarDay(date))) {
        return res.status(400).json({
          error: 'Past lesson cannot be planned',
          message: 'Занятия за прошедшие даты нельзя сохранять как запланированные. Они могут быть только проведенными или отмененными.',
        });
      }

      if (nextStatus === 'PLANNED' && existingLesson.userId) {
        const conflicts = await findConflictsForOccurrences(
          existingLesson.userId,
          nextStarts,
          nextDurationMin,
          targetIds
        );

        if (conflicts.length > 0) {
          return res.status(409).json({
            error: 'Конфликт времени',
            message: 'Часть занятий серии пересекается с текущим расписанием',
            conflicts,
          });
        }
      }

      const updatedLessons = await prisma.$transaction(targetLessons.map((lesson, index) => (
        prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            clientId: clientId !== undefined ? nextClientId : undefined,
            startTime: nextStarts[index],
            durationMin: nextDurationMin,
            type,
            status: nextStatus,
            notes: notes === undefined ? undefined : notes || null,
          },
          include: {
            client: {
              select: {
                id: true,
                fullName: true,
                address: true,
              },
            },
            ...lessonParticipantsInclude,
          },
        })
      )));

      if (nextParticipantIds) {
        await prisma.$transaction(targetIds.flatMap((lessonId) => [
          prisma.lessonParticipant.deleteMany({ where: { lessonId } }),
          ...nextParticipantIds.map((participantClientId) => (
            prisma.lessonParticipant.create({ data: { lessonId, clientId: participantClientId } })
          )),
        ]));
      }

      const refreshedLessons = nextParticipantIds
        ? await prisma.lesson.findMany({
            where: { id: { in: targetIds } },
            orderBy: { startTime: 'asc' },
            include: {
              client: {
                select: {
                  id: true,
                  fullName: true,
                  address: true,
                },
              },
              ...lessonParticipantsInclude,
            },
          })
        : updatedLessons;

      const firstUpdated = updatedLessons[0];
      if (firstUpdated) {
        await prisma.recurringSeries.update({
          where: { id: existingLesson.recurringSeriesId },
          data: {
            clientId: clientId !== undefined ? nextClientId : undefined,
            weekday: startTime !== undefined ? getIsoWeekday(firstUpdated.startTime) : undefined,
            startTime: startTime !== undefined ? formatTimeValue(firstUpdated.startTime) : undefined,
            durationMin: nextDurationMin,
            type,
            notes: notes === undefined ? undefined : notes || null,
            status: scope === 'series' && nextStatus === 'CANCELLED' ? 'CANCELLED' : undefined,
          },
        });
      }

      if (nextStatus === 'CANCELLED') {
        await Promise.all(updatedLessons.map(cancelMatchingSlotRequestsForLesson));
      }

      await logAuditAction({
        userId: existingLesson.userId,
        action: getLessonStatusAuditAction(existingLesson.status, nextStatus),
        entity: 'RecurringSeries',
        entityId: existingLesson.recurringSeriesId,
        details: {
          scope,
          updatedCount: refreshedLessons.length,
          participantClientIds: nextParticipantIds,
          participantNames: nextParticipantNames,
          oldStatus: existingLesson.status,
          newStatus: nextStatus,
          changedBy: user.id,
        },
      });

      return res.json({
        success: true,
        updatedCount: refreshedLessons.length,
        lessons: refreshedLessons,
      });
    }

    const nextStartTime = startTime !== undefined ? new Date(startTime) : existingLesson.startTime;
    const nextDurationMin = durationMin !== undefined ? Number(durationMin) : existingLesson.durationMin;
    const nextStatus = isPastCalendarDay(nextStartTime) && (status ?? existingLesson.status) === 'PLANNED'
      ? 'DONE'
      : (status ?? existingLesson.status);
    const nextUserId = existingLesson.userId;

    if (nextStatus === 'PLANNED' && nextUserId) {
      const conflict = await findPlannedLessonConflict(nextUserId, nextStartTime, nextDurationMin, parseInt(id));
      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: describeBusyConflictMessage(conflict),
          conflictingLesson: {
            id: conflict.id,
            clientName: conflict.client?.fullName,
            startTime: conflict.startTime,
          },
        });
      }
    }

    // Обновление занятия
    const lesson = await prisma.lesson.update({
      where: { id: parseInt(id) },
      data: {
        clientId: clientId !== undefined ? nextClientId : undefined,
        startTime: nextStartTime,
        durationMin: nextDurationMin,
        type,
        status: nextStatus,
        notes: notes === undefined ? undefined : notes || null,
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            address: true,
          },
        },
        ...lessonParticipantsInclude,
      },
    });

    let responseLesson = lesson;
    if (nextParticipantIds) {
      await prisma.$transaction([
        prisma.lessonParticipant.deleteMany({ where: { lessonId: lesson.id } }),
        ...nextParticipantIds.map((participantClientId) => (
          prisma.lessonParticipant.create({ data: { lessonId: lesson.id, clientId: participantClientId } })
        )),
      ]);

      const refreshedLesson = await prisma.lesson.findUnique({
        where: { id: lesson.id },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              address: true,
            },
          },
          ...lessonParticipantsInclude,
        },
      });

      if (refreshedLesson) {
        responseLesson = refreshedLesson;
      }
    }

    if (lesson.status === 'CANCELLED') {
      await cancelMatchingSlotRequestsForLesson(lesson);
    }

    console.log('✅ [Lessons] Занятие обновлено');

    await logAuditAction({
      userId: lesson.userId,
      action: getLessonStatusAuditAction(existingLesson.status, lesson.status),
      entity: 'Lesson',
      entityId: responseLesson.id,
      details: {
        clientId: responseLesson.clientId,
        clientName: responseLesson.client?.fullName,
        participantClientIds: nextParticipantIds,
        participantNames: nextParticipantNames,
        oldStatus: existingLesson.status,
        newStatus: responseLesson.status,
        changedBy: user.id,
      },
    });

    res.json(responseLesson);
  } catch (error) {
    console.error('❌ [Lessons] Error updating lesson:', error);
    res.status(500).json({
      error: 'Failed to update lesson',
      message: 'Ошибка при обновлении занятия',
    });
  }
});

// Изменить статус занятия (с проверкой доступа)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, scope = 'single' } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    console.log('🔄 [Lessons] Изменение статуса занятия:', {
      lessonId: id,
      newStatus: status,
      userId: user.id,
      role: user.role
    });

    // Валидация статуса
    const validStatuses = ['PLANNED', 'DONE', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Некорректный статус. Допустимые значения: PLANNED, DONE, CANCELLED',
      });
    }

    const lessonId = parseInt(id);
    const existingLesson = await getLessonAccess(lessonId, user);

    if (!existingLesson) {
      console.log('⚠️ [Lessons] Занятие не найдено или нет доступа');
      return res.status(404).json({
        error: 'Lesson not found',
        message: 'Занятие не найдено или у вас нет доступа к нему',
      });
    }

    if (status === 'DONE') {
      if (scope !== 'single') {
        return res.status(400).json({
          error: 'Invalid status scope',
          message: 'Проведенным можно отметить только конкретное занятие, а не всю регулярную серию',
        });
      }

      if (isFutureCalendarDay(existingLesson.startTime)) {
        return res.status(400).json({
          error: 'Future lesson cannot be completed',
          message: 'Нельзя отметить проведенным занятие из будущей даты',
        });
      }
    }

    if (status === 'PLANNED' && isPastCalendarDay(existingLesson.startTime)) {
      return res.status(400).json({
        error: 'Past lesson cannot be planned',
        message: 'Занятие за прошедшую дату нельзя вернуть в статус запланированного. Оно может быть только проведенным или отмененным.',
      });
    }

    if (existingLesson.recurringSeriesId && scope !== 'single') {
      const seriesWhere = scope === 'future'
        ? {
            recurringSeriesId: existingLesson.recurringSeriesId,
            startTime: { gte: existingLesson.startTime },
          }
        : {
            recurringSeriesId: existingLesson.recurringSeriesId,
          };

      const targetLessons = await prisma.lesson.findMany({
        where: seriesWhere,
        orderBy: { startTime: 'asc' },
        include: {
          client: {
            select: {
              fullName: true,
            },
          },
        },
      });

      if (status === 'PLANNED' && existingLesson.userId) {
        const conflicts = await findConflictsForOccurrences(
          existingLesson.userId,
          targetLessons.map(lesson => lesson.startTime),
          existingLesson.durationMin,
          targetLessons.map(lesson => lesson.id)
        );

        if (conflicts.length > 0) {
          return res.status(409).json({
            error: 'Конфликт времени',
            message: 'Нельзя восстановить серию: часть занятий пересекается с текущим расписанием',
            conflicts,
          });
        }
      }

      await prisma.lesson.updateMany({
        where: {
          id: {
            in: targetLessons.map(lesson => lesson.id),
          },
        },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      if (scope === 'series' && status === 'CANCELLED') {
        await prisma.recurringSeries.update({
          where: { id: existingLesson.recurringSeriesId },
          data: { status: 'CANCELLED' },
        });
      }

      if (status === 'CANCELLED') {
        await Promise.all(targetLessons.map(cancelMatchingSlotRequestsForLesson));
      }

      await logAuditAction({
        userId: existingLesson.userId,
        action: getLessonStatusAuditAction(existingLesson.status, status),
        entity: 'RecurringSeries',
        entityId: existingLesson.recurringSeriesId,
        details: {
          scope,
          updatedCount: targetLessons.length,
          oldStatus: existingLesson.status,
          newStatus: status,
          changedBy: user.id,
        },
      });

      return res.json({
        success: true,
        updatedCount: targetLessons.length,
        recurringSeriesId: existingLesson.recurringSeriesId,
      });
    }

    if (status === 'PLANNED' && existingLesson.userId) {
      const conflict = await findPlannedLessonConflict(
        existingLesson.userId,
        existingLesson.startTime,
        existingLesson.durationMin,
        lessonId
      );

      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: describeBusyConflictMessage(conflict, 'Нельзя восстановить занятие: время пересекается'),
          conflictingLesson: {
            id: conflict.id,
            clientName: conflict.client?.fullName,
            startTime: conflict.startTime,
          },
        });
      }
    }

    // Обновление статуса
    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (lesson.status === 'CANCELLED') {
      await cancelMatchingSlotRequestsForLesson(lesson);
    }

    console.log('✅ [Lessons] Статус изменен');

    await logAuditAction({
      userId: lesson.userId,
      action: getLessonStatusAuditAction(existingLesson.status, lesson.status),
      entity: 'Lesson',
      entityId: lesson.id,
      details: {
        clientId: lesson.clientId,
        clientName: lesson.client?.fullName,
        oldStatus: existingLesson.status,
        newStatus: lesson.status,
        changedBy: user.id,
      },
    });

    res.json(lesson);
  } catch (error) {
    console.error('❌ [Lessons] Error updating lesson status:', error);
    res.status(500).json({
      error: 'Failed to update lesson status',
      message: 'Ошибка при изменении статуса занятия',
    });
  }
});

// Отменить занятие без удаления из БД (с проверкой доступа)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'single';
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    console.log('🗑️ [Lessons] Отмена занятия:', {
      lessonId: id,
      userId: user.id,
      role: user.role
    });

    // Проверка существования занятия и доступа
    const whereClause = user.role === 'ADMIN'
      ? { id: parseInt(id) }
      : { id: parseInt(id), userId: user.id };

    const existingLesson = await prisma.lesson.findFirst({
      where: whereClause,
    });

    if (!existingLesson) {
      console.log('⚠️ [Lessons] Занятие не найдено или нет доступа');
      return res.status(404).json({
        error: 'Lesson not found',
        message: 'Занятие не найдено или у вас нет доступа к нему',
      });
    }

    if (existingLesson.recurringSeriesId && scope !== 'single') {
      const targetLessons = await prisma.lesson.findMany({
        where: scope === 'future'
          ? {
              recurringSeriesId: existingLesson.recurringSeriesId,
              startTime: { gte: existingLesson.startTime },
            }
          : {
              recurringSeriesId: existingLesson.recurringSeriesId,
            },
      });

      await prisma.lesson.updateMany({
        where: {
          id: {
            in: targetLessons.map(lesson => lesson.id),
          },
        },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date(),
        },
      });

      if (scope === 'series') {
        await prisma.recurringSeries.update({
          where: { id: existingLesson.recurringSeriesId },
          data: { status: 'CANCELLED' },
        });
      }

      await Promise.all(targetLessons.map(cancelMatchingSlotRequestsForLesson));

      await logAuditAction({
        userId: existingLesson.userId,
        action: 'lesson.cancel',
        entity: 'RecurringSeries',
        entityId: existingLesson.recurringSeriesId,
        details: {
          scope,
          updatedCount: targetLessons.length,
          oldStatus: existingLesson.status,
          newStatus: 'CANCELLED',
          changedBy: user.id,
        },
      });

      return res.json({
        success: true,
        message: 'Регулярные занятия отменены',
        updatedCount: targetLessons.length,
      });
    }

    const lesson = await prisma.lesson.update({
      where: { id: parseInt(id) },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    await cancelMatchingSlotRequestsForLesson(lesson);

    console.log('✅ [Lessons] Занятие отменено');

    await logAuditAction({
      userId: lesson.userId,
      action: 'lesson.cancel',
      entity: 'Lesson',
      entityId: lesson.id,
      details: {
        clientId: lesson.clientId,
        clientName: lesson.client?.fullName,
        oldStatus: existingLesson.status,
        newStatus: lesson.status,
        changedBy: user.id,
      },
    });

    res.json({
      success: true,
      message: 'Занятие отменено',
      lesson,
    });
  } catch (error) {
    console.error('❌ [Lessons] Error deleting lesson:', error);
    res.status(500).json({
      error: 'Failed to delete lesson',
      message: 'Ошибка при удалении занятия',
    });
  }
});

export default router;
