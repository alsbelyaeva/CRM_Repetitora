import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { rankSlots as rankProposedSlots, ProposedSlot } from '../services/slotRanking';

const DEFAULT_PREFERRED_TIMES = {
  morning: { period: 'morning', enabled: false, weight: 0.5 },
  day: { period: 'day', enabled: true, weight: 0.7 },
  evening: { period: 'evening', enabled: false, weight: 0.5 },
};

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastCalendarDay(date: Date) {
  return startOfLocalDay(date).getTime() < startOfLocalDay(new Date()).getTime();
}

function validateProposedSlots(slots: any[]): string | null {
  for (const slot of slots) {
    if (!slot?.from || !slot?.to) {
      return 'Каждый слот должен содержать from и to';
    }

    const from = new Date(slot.from);
    const to = new Date(slot.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return 'Слот содержит некорректную дату';
    }

    if (to <= from) {
      return 'Время окончания слота должно быть позже времени начала';
    }

    if (isPastCalendarDay(from)) {
      return 'Запросы слотов нельзя создавать на прошедшие даты. Задним числом занятие можно добавить только в календаре как проведенное.';
    }
  }

  return null;
}

export async function rankSlots(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const { proposedSlots, clientId, userId: assignedTeacherId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!Array.isArray(proposedSlots) || proposedSlots.length === 0) {
      return res.status(400).json({ error: 'proposedSlots должен быть непустым массивом' });
    }

    const slotError = validateProposedSlots(proposedSlots);
    if (slotError) {
      return res.status(400).json({ error: slotError });
    }

    const numericClientId = Number(clientId);
    if (!Number.isInteger(numericClientId) || numericClientId <= 0) {
      return res.status(400).json({ error: 'clientId обязателен' });
    }

    const targetUserId = req.user?.role === 'ADMIN' && assignedTeacherId ? String(assignedTeacherId) : userId;

    if (req.user?.role === 'ADMIN' && targetUserId === userId) {
      return res.status(400).json({ error: 'Админ должен выбрать преподавателя для ранжирования' });
    }

    let weights = await prisma.slotWeight.findUnique({ where: { userId: targetUserId } });

    if (!weights) {
      weights = await prisma.slotWeight.create({
        data: {
          userId: targetUserId,
          wTime: 0.3,
          wCompact: 0.3,
          wWorkingDay: 0.2,
          wPriority: 0.2,
          wTravel: 0.15,
          workingDays: DEFAULT_WORKING_DAYS,
          preferredTimes: DEFAULT_PREFERRED_TIMES,
          minGapMinutes: 60,
          maxGapMinutes: 180,
          desiredBreakMinutes: 30,
          maxTravelMinutes: 60,
          gapImportance: 0.5,
        },
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: numericClientId,
        userId: targetUserId,
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден или не принадлежит вам' });
    }

    const teacher = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        address: true,
      },
    });

    const [lessons, scheduleEvents] = await Promise.all([
      prisma.lesson.findMany({
        where: {
          userId: targetUserId,
          status: 'PLANNED',
        },
        include: {
          client: {
            select: {
              fullName: true,
              address: true,
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.scheduleEvent.findMany({
        where: {
          userId: targetUserId,
          status: 'ACTIVE',
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const busyItems = [
      ...lessons.map(lesson => ({
        ...lesson,
        kind: 'lesson' as const,
      })),
      ...scheduleEvents.map(event => ({
        id: event.id,
        kind: 'event' as const,
        title: event.title,
        startTime: event.startTime,
        durationMin: event.durationMin,
        location: event.location,
      })),
    ].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const workingDays = (weights.workingDays as number[]) || DEFAULT_WORKING_DAYS;
    const preferredTimes = (weights.preferredTimes as any) || DEFAULT_PREFERRED_TIMES;

    const rankedSlots = await rankProposedSlots(
      proposedSlots as ProposedSlot[],
      busyItems,
      {
        weights: {
          wTime: weights.wTime,
          wCompact: weights.wCompact,
          wWorkingDay: weights.wWorkingDay,
          wPriority: weights.wPriority,
          wTravel: weights.wTravel,
        },
        workingDays,
        preferredTimes,
        minGapMinutes: weights.minGapMinutes || 60,
        maxGapMinutes: weights.maxGapMinutes || 180,
        desiredBreakMinutes: weights.desiredBreakMinutes || 30,
        maxTravelMinutes: weights.maxTravelMinutes ?? 60,
        slotAddress: client.address,
        userAddress: teacher?.address,
      },
      client.vip
    );

    res.json({
      rankedSlots,
      weights: {
        wTime: weights.wTime,
        wCompact: weights.wCompact,
        wWorkingDay: weights.wWorkingDay,
        wPriority: weights.wPriority,
        wTravel: weights.wTravel,
        workingDays,
        preferredTimes,
        minGapMinutes: weights.minGapMinutes,
        maxGapMinutes: weights.maxGapMinutes,
        desiredBreakMinutes: weights.desiredBreakMinutes,
        maxTravelMinutes: weights.maxTravelMinutes,
        gapImportance: weights.gapImportance,
      },
      clientVip: client.vip,
    });
  } catch (err: any) {
    console.error('Ошибка ранжирования слотов:', err);
    res.status(500).json({ error: 'Ошибка ранжирования', details: err.message });
  }
}

function checkTimeConflict(slotStart: Date, slotEnd: Date, lessons: any[]): any | null {
  for (const lesson of lessons) {
    const lessonStart = new Date(lesson.startTime);
    const lessonEnd = new Date(lessonStart.getTime() + lesson.durationMin * 60 * 1000);

    if (slotStart < lessonEnd && slotEnd > lessonStart) {
      return lesson;
    }
  }

  return null;
}

function checkBusyConflict(slotStart: Date, slotEnd: Date, lessons: any[], events: any[]): any | null {
  const lessonConflict = checkTimeConflict(slotStart, slotEnd, lessons);
  if (lessonConflict) return { ...lessonConflict, kind: 'lesson' };

  for (const event of events) {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(eventStart.getTime() + event.durationMin * 60 * 1000);

    if (slotStart < eventEnd && slotEnd > eventStart) {
      return {
        ...event,
        kind: 'event',
        client: { fullName: event.title },
      };
    }
  }

  return null;
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

function getRequestStatusAfterSlotUpdate(slots: any[], fallback = 'PENDING') {
  if (slots.length === 0) return 'CANCELLED';
  if (slots.every(slot => slot?.status === 'CANCELLED')) return 'CANCELLED';
  if (slots.some(slot => slot?.status === 'CONFIRMED' || slot?.status === 'ACCEPTED')) return 'CONFIRMED';
  return fallback === 'CANCELLED' ? 'PENDING' : fallback;
}

export async function selectAndCreateLesson(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const { selectedSlot, clientId, durationMin = 60, type = 'Индивидуальное', notes = null, userId: assignedTeacherId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!selectedSlot?.from || !selectedSlot?.to) {
      return res.status(400).json({ error: 'Требуется selectedSlot с from и to' });
    }

    if (!clientId) {
      return res.status(400).json({ error: 'Требуется clientId' });
    }

    const targetUserId = req.user?.role === 'ADMIN' && assignedTeacherId ? String(assignedTeacherId) : userId;

    if (req.user?.role === 'ADMIN' && targetUserId === userId) {
      return res.status(400).json({ error: 'Админ должен выбрать преподавателя' });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: Number(clientId),
        userId: targetUserId,
      },
    });

    if (!client) {
      return res.status(403).json({ error: 'Клиент не найден или не принадлежит вам' });
    }

    const startTime = new Date(selectedSlot.from);
    const endTime = new Date(startTime.getTime() + Number(durationMin) * 60 * 1000);

    if (isPastCalendarDay(startTime)) {
      return res.status(400).json({
        error: 'Past slot cannot be accepted',
        message: 'Нельзя подтвердить запрос слота за прошедшую дату. Задним числом занятие можно добавить только в календаре как проведенное.',
      });
    }

    const [currentLessons, currentEvents] = await Promise.all([
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
        orderBy: { startTime: 'asc' },
      }),
      prisma.scheduleEvent.findMany({
        where: {
          userId: targetUserId,
          status: 'ACTIVE',
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const conflict = checkBusyConflict(startTime, endTime, currentLessons, currentEvents);

    if (conflict) {
      return res.status(409).json({
        error: 'Конфликт времени',
        message: conflict.kind === 'event' ? 'Это время занято личным событием' : 'Это время занято другим клиентом',
        conflictingLesson: {
          id: conflict.id,
          clientName: conflict.client?.fullName,
          startTime: conflict.startTime,
          kind: conflict.kind,
        },
        canReplace: conflict.kind !== 'event',
      });
    }

    const newLesson = await prisma.lesson.create({
      data: {
        clientId: Number(clientId),
        userId: targetUserId,
        startTime,
        durationMin: Number(durationMin),
        type,
        status: 'PLANNED',
        notes,
        participants: {
          create: [{ clientId: Number(clientId) }],
        },
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
          },
        },
        participants: {
          include: {
            client: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      message: 'Занятие успешно создано',
      lesson: newLesson,
    });
  } catch (err: any) {
    console.error('Ошибка при создании занятия:', err);
    res.status(500).json({ error: 'Ошибка при создании занятия', details: err.message });
  }
}

export async function replaceConflictingLesson(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const {
      conflictingLessonId,
      selectedSlot,
      clientId,
      userId: assignedTeacherId,
      durationMin = 60,
      type = 'Индивидуальное',
      notes = null,
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!conflictingLessonId || !selectedSlot?.from || !clientId) {
      return res.status(400).json({ error: 'Требуются: conflictingLessonId, selectedSlot, clientId' });
    }

    const targetUserId = req.user?.role === 'ADMIN' && assignedTeacherId ? String(assignedTeacherId) : userId;

    if (req.user?.role === 'ADMIN' && targetUserId === userId) {
      return res.status(400).json({ error: 'Админ должен выбрать преподавателя' });
    }

    const existingLesson = await prisma.lesson.findFirst({
      where: {
        id: Number(conflictingLessonId),
        userId: targetUserId,
      },
    });

    if (!existingLesson) {
      return res.status(404).json({ error: 'Конфликтующее занятие не найдено' });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: Number(clientId),
        userId: targetUserId,
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const startTime = new Date(selectedSlot.from);

    if (isPastCalendarDay(startTime)) {
      return res.status(400).json({
        error: 'Past slot cannot be accepted',
        message: 'Нельзя заменить занятие запросом слота за прошедшую дату. Задним числом занятие можно добавить только в календаре как проведенное.',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: { id: Number(conflictingLessonId) },
        data: { status: 'CANCELLED' },
      });

      const affectedRequests = await tx.slotRequest.findMany({
        where: {
          userId: targetUserId,
          clientId: existingLesson.clientId,
        },
      });

      await Promise.all(affectedRequests.map(async (request) => {
        const slots = Array.isArray(request.proposedSlots) ? request.proposedSlots : [];
        let changed = false;
        const updatedSlots = slots.map((slot) => {
          const normalizedSlot = normalizeSlot(slot);
          if (slotMatchesLesson(normalizedSlot, existingLesson) && normalizedSlot.status !== 'CANCELLED') {
            changed = true;
            return { ...normalizedSlot, status: 'CANCELLED' };
          }
          return normalizedSlot;
        });

        if (!changed) return;

        await tx.slotRequest.update({
          where: { id: request.id },
          data: {
            proposedSlots: updatedSlots,
            status: getRequestStatusAfterSlotUpdate(updatedSlots, request.status),
          },
        });
      }));

      return tx.lesson.create({
        data: {
          clientId: Number(clientId),
          userId: targetUserId,
          startTime,
          durationMin: Number(durationMin),
          type,
          status: 'PLANNED',
          notes,
          participants: {
            create: [{ clientId: Number(clientId) }],
          },
        },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
            },
          },
          participants: {
            include: {
              client: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      message: 'Занятие заменено',
      cancelledLessonId: Number(conflictingLessonId),
      lesson: result,
    });
  } catch (err: any) {
    console.error('Ошибка при замене занятия:', err);
    res.status(500).json({ error: 'Ошибка при замене занятия', details: err.message });
  }
}
