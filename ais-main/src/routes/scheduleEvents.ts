import { Router } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const EVENT_TYPES = ['PERSONAL', 'TRAVEL', 'OTHER'];
const EVENT_STATUSES = ['ACTIVE', 'CANCELLED'];

router.use(authMiddleware);

function getEventEnd(event: { startTime: Date; durationMin: number }) {
  return new Date(event.startTime.getTime() + event.durationMin * 60 * 1000);
}

function overlaps(
  startTime: Date,
  durationMin: number,
  item: { startTime: Date; durationMin: number }
) {
  const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000);
  return startTime < getEventEnd(item) && item.startTime < endTime;
}

function parseEventInput(body: any) {
  const startTime = new Date(body.startTime);
  const durationMin = Number(body.durationMin);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const type = typeof body.type === 'string' ? body.type : 'PERSONAL';
  const status = typeof body.status === 'string' ? body.status : 'ACTIVE';

  if (!title) return { error: 'Укажите название события' };
  if (Number.isNaN(startTime.getTime())) return { error: 'Некорректная дата события' };
  if (!Number.isFinite(durationMin) || durationMin <= 0) return { error: 'Некорректная длительность события' };
  if (!EVENT_TYPES.includes(type)) return { error: 'Некорректный тип события' };
  if (!EVENT_STATUSES.includes(status)) return { error: 'Некорректный статус события' };

  return {
    title,
    startTime,
    durationMin,
    type,
    status,
    location: typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null,
    latitude: body.latitude === undefined || body.latitude === null || body.latitude === ''
      ? null
      : Number(body.latitude),
    longitude: body.longitude === undefined || body.longitude === null || body.longitude === ''
      ? null
      : Number(body.longitude),
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
  };
}

async function getTargetUserId(user: any, requestedUserId?: string) {
  if (!user) return null;
  if (user.role !== 'ADMIN') return user.id;
  if (!requestedUserId) return null;

  const teacher = await prisma.user.findFirst({
    where: { id: requestedUserId, role: 'TEACHER' },
    select: { id: true },
  });

  return teacher?.id ?? null;
}

async function getEventAccess(id: number, user: any) {
  return prisma.scheduleEvent.findFirst({
    where: user.role === 'ADMIN' ? { id } : { id, userId: user.id },
  });
}

async function findBusyConflict(
  userId: string,
  startTime: Date,
  durationMin: number,
  excludeEventId?: number
) {
  const [lessons, events] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        userId,
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
        userId,
        status: 'ACTIVE',
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      },
    }),
  ]);

  const conflictingLesson = lessons.find(lesson => overlaps(startTime, durationMin, lesson));
  if (conflictingLesson) {
    return {
      kind: 'LESSON',
      id: conflictingLesson.id,
      title: conflictingLesson.client?.fullName || 'Занятие',
      startTime: conflictingLesson.startTime,
      endTime: getEventEnd(conflictingLesson),
    };
  }

  const conflictingEvent = events.find(event => overlaps(startTime, durationMin, event));
  if (conflictingEvent) {
    return {
      kind: 'EVENT',
      id: conflictingEvent.id,
      title: conflictingEvent.title,
      startTime: conflictingEvent.startTime,
      endTime: getEventEnd(conflictingEvent),
    };
  }

  return null;
}

router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    if (!user) return res.status(401).json({ error: 'Не авторизован' });

    const where = user.role === 'ADMIN'
      ? (requestedUserId ? { userId: requestedUserId } : {})
      : { userId: user.id };

    const events = await prisma.scheduleEvent.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    res.json(events);
  } catch (error: any) {
    console.error('Ошибка получения событий расписания:', error);
    res.status(500).json({ error: 'Ошибка получения событий расписания', details: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Не авторизован' });

    const targetUserId = await getTargetUserId(
      user,
      typeof req.body.userId === 'string' ? req.body.userId : undefined
    );

    if (!targetUserId) {
      return res.status(400).json({ error: 'Выберите преподавателя для события' });
    }

    const parsed = parseEventInput(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    if (parsed.status === 'ACTIVE') {
      const conflict = await findBusyConflict(targetUserId, parsed.startTime, parsed.durationMin);
      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: `Это время пересекается с ${conflict.kind === 'LESSON' ? 'занятием' : 'событием'}: ${conflict.title}`,
          conflict,
        });
      }
    }

    const event = await prisma.scheduleEvent.create({
      data: {
        ...parsed,
        userId: targetUserId,
      },
    });

    res.status(201).json(event);
  } catch (error: any) {
    console.error('Ошибка создания события расписания:', error);
    res.status(500).json({ error: 'Ошибка создания события расписания', details: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = req.user;
    const id = Number(req.params.id);

    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Некорректный id события' });

    const existing = await getEventAccess(id, user);
    if (!existing) return res.status(404).json({ error: 'Событие не найдено' });

    const parsed = parseEventInput({
      ...existing,
      ...req.body,
      title: req.body.title ?? existing.title,
      startTime: req.body.startTime ?? existing.startTime,
      durationMin: req.body.durationMin ?? existing.durationMin,
      type: req.body.type ?? existing.type,
      status: req.body.status ?? existing.status,
    });

    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    if (parsed.status === 'ACTIVE') {
      const conflict = await findBusyConflict(existing.userId, parsed.startTime, parsed.durationMin, id);
      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: `Это время пересекается с ${conflict.kind === 'LESSON' ? 'занятием' : 'событием'}: ${conflict.title}`,
          conflict,
        });
      }
    }

    const event = await prisma.scheduleEvent.update({
      where: { id },
      data: parsed,
    });

    res.json(event);
  } catch (error: any) {
    console.error('Ошибка обновления события расписания:', error);
    res.status(500).json({ error: 'Ошибка обновления события расписания', details: error.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const user = req.user;
    const id = Number(req.params.id);
    const status = typeof req.body.status === 'string' ? req.body.status : '';

    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Некорректный id события' });
    if (!EVENT_STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус события' });

    const existing = await getEventAccess(id, user);
    if (!existing) return res.status(404).json({ error: 'Событие не найдено' });

    if (status === 'ACTIVE') {
      const conflict = await findBusyConflict(existing.userId, existing.startTime, existing.durationMin, id);
      if (conflict) {
        return res.status(409).json({
          error: 'Конфликт времени',
          message: `Нельзя восстановить событие: время пересекается с ${conflict.title}`,
          conflict,
        });
      }
    }

    const event = await prisma.scheduleEvent.update({
      where: { id },
      data: { status },
    });

    res.json(event);
  } catch (error: any) {
    console.error('Ошибка изменения статуса события:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса события', details: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = req.user;
    const id = Number(req.params.id);

    if (!user) return res.status(401).json({ error: 'Не авторизован' });
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Некорректный id события' });

    const existing = await getEventAccess(id, user);
    if (!existing) return res.status(404).json({ error: 'Событие не найдено' });

    await prisma.scheduleEvent.delete({ where: { id } });
    res.json({ message: 'Событие удалено' });
  } catch (error: any) {
    console.error('Ошибка удаления события расписания:', error);
    res.status(500).json({ error: 'Ошибка удаления события расписания', details: error.message });
  }
});

export default router;
