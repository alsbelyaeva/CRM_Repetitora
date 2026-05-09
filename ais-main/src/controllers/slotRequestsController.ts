import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const ACTIVE_REQUEST_STATUSES = ['PENDING', 'NEW', 'ACTIVE', 'CONFIRMED', 'ACCEPTED'];
const VALID_REQUEST_STATUSES = [...ACTIVE_REQUEST_STATUSES, 'REJECTED', 'CANCELLED'];

function canAccessSlotRequest(req: Request, requestUserId: string): boolean {
  return req.user?.role === 'ADMIN' || req.userId === requestUserId;
}

function normalizeSlot(slot: any, fallbackStatus = 'PENDING') {
  if (!slot || typeof slot !== 'object') return slot;
  return {
    ...slot,
    status: typeof slot.status === 'string' ? slot.status : fallbackStatus,
  };
}

function normalizeSlots(proposedSlots: any, fallbackStatus = 'PENDING') {
  return Array.isArray(proposedSlots)
    ? proposedSlots.map(slot => normalizeSlot(slot, fallbackStatus))
    : proposedSlots;
}

function setSlotsStatus(proposedSlots: any, status: string) {
  return Array.isArray(proposedSlots)
    ? proposedSlots.map(slot => normalizeSlot(slot, status))
    : proposedSlots;
}

function getNextRequestStatus(slots: any[], fallback = 'PENDING') {
  if (slots.length === 0) return 'CANCELLED';
  if (slots.every(slot => slot?.status === 'CANCELLED')) return 'CANCELLED';
  if (slots.some(slot => slot?.status === 'CONFIRMED' || slot?.status === 'ACCEPTED')) return 'CONFIRMED';
  return fallback === 'CANCELLED' ? 'PENDING' : fallback;
}

function slotDurationMinutes(slot: any) {
  const from = new Date(slot?.from);
  const to = new Date(slot?.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

function slotMatchesLesson(slot: any, lesson: { startTime: Date; durationMin: number }) {
  const durationMin = slotDurationMinutes(slot);
  if (durationMin === null) return false;

  const slotStart = new Date(slot.from);
  const lessonStart = new Date(lesson.startTime);
  return slotStart.getTime() === lessonStart.getTime() && durationMin === lesson.durationMin;
}

function getCancelledSlots(proposedSlots: any, requestStatus?: string) {
  if (!Array.isArray(proposedSlots)) return [];

  const normalizedSlots = proposedSlots.map(slot => normalizeSlot(slot));
  return requestStatus === 'CANCELLED'
    ? normalizedSlots
    : normalizedSlots.filter(slot => slot?.status === 'CANCELLED');
}

async function cancelLessonsForCancelledSlots(request: {
  userId: string;
  clientId: number;
  status?: string;
  proposedSlots: any;
}) {
  const cancelledSlots = getCancelledSlots(request.proposedSlots, request.status);
  if (cancelledSlots.length === 0) return;

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

  if (lessonIdsToCancel.length === 0) return;

  await prisma.lesson.updateMany({
    where: { id: { in: lessonIdsToCancel } },
    data: { status: 'CANCELLED' },
  });
}

function sortRequestsForDisplay<T extends { status: string; createdAt: Date }>(requests: T[]): T[] {
  return [...requests].sort((a, b) => {
    const aCancelled = a.status === 'CANCELLED' ? 1 : 0;
    const bCancelled = b.status === 'CANCELLED' ? 1 : 0;
    if (aCancelled !== bCancelled) return aCancelled - bCancelled;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function getAll(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const userRole = req.user?.role;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'active';
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const where: any = {};

    if (statusFilter === 'cancelled') {
      where.status = 'CANCELLED';
    } else if (statusFilter !== 'all') {
      where.status = { in: ACTIVE_REQUEST_STATUSES };
    }

    if (userRole === 'ADMIN') {
      if (requestedUserId) {
        where.userId = requestedUserId;
      }
    } else {
      where.userId = userId;
    }

    const requests = await prisma.slotRequest.findMany({
      where,
      include: { 
        client: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            vip: true
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    const normalizedRequests = sortRequestsForDisplay(requests.map(request => ({
      ...request,
      proposedSlots: normalizeSlots(
        request.proposedSlots,
        request.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'
      ),
    })));
    
    console.log(`✅ Получено ${normalizedRequests.length} запросов слотов для пользователя ${userId}`);
    
    res.json(normalizedRequests);
  } catch (err: any) {
    console.error('❌ Ошибка при получении slot requests:', err);
    res.status(500).json({ error: 'Ошибка при получении запросов слотов', details: err.message });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id запроса' });
    }
    
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const request = await prisma.slotRequest.findFirst({
      where: { 
        id: id
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });
    
    if (!request || !canAccessSlotRequest(req, request.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }
    
    res.json(request);
  } catch (err: any) {
    console.error('❌ Ошибка при получении slot request по id:', err);
    res.status(500).json({ error: 'Ошибка при получении запроса слота', details: err.message });
  }
}

// Создание slot request
export async function create(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const body: any = req.body ?? {};
    let { clientId, proposedSlots, status, userId: assignedTeacherId } = body;

    // Валидация clientId
    if (!clientId || !Number.isInteger(Number(clientId)) || Number(clientId) <= 0) {
      return res.status(400).json({ error: 'Некорректный clientId' });
    }
    
    clientId = Number(clientId);
    
    // Проверяем что клиент принадлежит пользователю
    const targetUserId = userRole === 'ADMIN' && assignedTeacherId ? String(assignedTeacherId) : userId;

    if (userRole === 'ADMIN' && targetUserId === userId) {
      return res.status(400).json({ error: 'Админ может создать запрос только преподавателю' });
    }

    const client = await prisma.client.findFirst({
      where: { 
        id: clientId,
        userId: targetUserId
      }
    });
    
    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден или не принадлежит вам' });
    }

    // Если слоты не переданы, создаём один слот "сейчас + 1 час"
    if (!proposedSlots || !Array.isArray(proposedSlots)) {
      const now = new Date();
      const later = new Date(now.getTime() + 60 * 60 * 1000);
      proposedSlots = [
        {
          from: now.toISOString(),
          to: later.toISOString(),
        },
      ];
    }

    if (!status) {
      status = 'PENDING';
    }

    const created = await prisma.slotRequest.create({
      data: {
        clientId: clientId,
        userId: targetUserId,
        proposedSlots: normalizeSlots(proposedSlots),
        status,
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            vip: true
          }
        }
      }
    });

    console.log(`✅ Запрос слота создан с ID: ${created.id} для клиента ${client.fullName}`);
    
    res.status(201).json(created);
  } catch (err: any) {
    console.error('❌ Ошибка при создании slot request:', err);
    res.status(500).json({ error: 'Ошибка при создании запроса слота', details: err.message });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id запроса' });
    }
    
    const userId = req.userId;
    const userRole = req.user?.role;
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const data: any = req.body ?? {};
    let updateData: any = {};

    // Проверяем что запрос принадлежит пользователю
    const existingRequest = await prisma.slotRequest.findFirst({
      where: { 
        id: id
      }
    });
    
    if (!existingRequest || !canAccessSlotRequest(req, existingRequest.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    // Обновляем статус
    if (data.status !== undefined) {
      if (!VALID_REQUEST_STATUSES.includes(data.status)) {
        return res.status(400).json({ error: 'Некорректный статус запроса' });
      }
      updateData.status = data.status;
    }

    // Обновляем слоты
    if (data.proposedSlots !== undefined) {
      updateData.proposedSlots = normalizeSlots(
        data.proposedSlots,
        data.status === 'CANCELLED' || existingRequest.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'
      );

      if (data.status === undefined && Array.isArray(updateData.proposedSlots)) {
        updateData.status = getNextRequestStatus(updateData.proposedSlots, existingRequest.status);
      }
    }

    if (updateData.status === 'CANCELLED') {
      updateData.proposedSlots = setSlotsStatus(
        updateData.proposedSlots ?? existingRequest.proposedSlots,
        'CANCELLED'
      );
    }

    // Изменение клиента
    if (data.clientId !== undefined) {
      const cid = Number(data.clientId);
      if (!Number.isInteger(cid) || cid <= 0) {
        return res.status(400).json({ error: 'Некорректный clientId' });
      }
      
      // Проверяем что новый клиент принадлежит пользователю
      const client = await prisma.client.findFirst({
        where: { 
          id: cid,
          userId: userRole === 'ADMIN' ? existingRequest.userId : userId
        }
      });
      
      if (!client) {
        return res.status(404).json({ error: 'Клиент не найден или не принадлежит вам' });
      }
      
      updateData.clientId = cid;
    }

    const updated = await prisma.slotRequest.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    if (updateData.proposedSlots !== undefined || updateData.status === 'CANCELLED') {
      await cancelLessonsForCancelledSlots({
        userId: existingRequest.userId,
        clientId: updateData.clientId ?? existingRequest.clientId,
        status: updateData.status ?? existingRequest.status,
        proposedSlots: updated.proposedSlots,
      });
    }
    
    console.log(`✅ Запрос слота ${id} обновлен`);
    
    res.json(updated);
  } catch (err: any) {
    console.error('❌ Ошибка при обновлении slot request:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Запрос не найден' });
    }
    res.status(500).json({ error: 'Ошибка при обновлении запроса слота', details: err.message });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id запроса' });
    }
    
    const userId = req.userId;
    const userRole = req.user?.role;
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const existing = await prisma.slotRequest.findFirst({
      where: { 
        id: id
      }
    });
    
    if (!existing || !canAccessSlotRequest(req, existing.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    const cancelledSlots = setSlotsStatus(existing.proposedSlots, 'CANCELLED');
    const updated = await prisma.slotRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        proposedSlots: cancelledSlots,
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    await cancelLessonsForCancelledSlots({
      userId: existing.userId,
      clientId: existing.clientId,
      status: 'CANCELLED',
      proposedSlots: cancelledSlots,
    });
    
    console.log(`✅ Запрос слота ${id} отменен пользователем ${userId}`);
    
    res.json({ message: 'Запрос отменен', request: updated });
  } catch (err: any) {
    console.error('❌ Ошибка при удалении slot request:', err);
    res.status(500).json({ error: 'Ошибка при удалении запроса слота', details: err.message });
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный id запроса' });
    }

    const existing = await prisma.slotRequest.findFirst({ where: { id } });
    if (!existing || !canAccessSlotRequest(req, existing.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    const restoredSlots = Array.isArray(existing.proposedSlots)
      ? existing.proposedSlots.map(slot => (
          normalizeSlot(slot, 'PENDING')?.status === 'CANCELLED'
            ? { ...normalizeSlot(slot, 'PENDING'), status: 'PENDING' }
            : normalizeSlot(slot, 'PENDING')
        ))
      : existing.proposedSlots;

    const updated = await prisma.slotRequest.update({
      where: { id },
      data: {
        status: 'PENDING',
        proposedSlots: restoredSlots as any,
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    res.json({ message: 'Запрос восстановлен', request: updated });
  } catch (err: any) {
    console.error('❌ Ошибка при восстановлении slot request:', err);
    res.status(500).json({ error: 'Ошибка при восстановлении запроса слота', details: err.message });
  }
}

// Принятие конкретного слота из запроса
export async function acceptSlot(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const userId = req.userId;
    const { slotIndex } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (slotIndex === undefined || !Number.isInteger(slotIndex)) {
      return res.status(400).json({ error: 'Требуется slotIndex' });
    }

    const request = await prisma.slotRequest.findFirst({
      where: { 
        id: requestId
      },
      include: {
        client: true
      }
    });

    if (!request || !canAccessSlotRequest(req, request.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    const slots = request.proposedSlots as any[];
    
    if (slotIndex < 0 || slotIndex >= slots.length) {
      return res.status(400).json({ error: 'Некорректный индекс слота' });
    }

    const selectedSlot = slots[slotIndex];
    const normalizedSelectedSlot = normalizeSlot(selectedSlot);

    if (request.status === 'CANCELLED' || normalizedSelectedSlot?.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Нельзя принять отмененный слот' });
    }

    const updatedSlots = slots.map((slot, idx) => (
      idx === slotIndex
        ? { ...normalizeSlot(slot), status: 'CONFIRMED' }
        : normalizeSlot(slot)
    ));

    // Помечаем запрос как принятый
    await prisma.slotRequest.update({
      where: { id: requestId },
      data: {
        status: 'CONFIRMED',
        proposedSlots: updatedSlots,
      }
    });

    console.log(`✅ Слот ${slotIndex} из запроса ${requestId} принят`);

    res.json({ 
      message: 'Слот принят',
      slot: selectedSlot,
      request: request
    });
  } catch (err: any) {
    console.error('❌ Ошибка при принятии слота:', err);
    res.status(500).json({ error: 'Ошибка при принятии слота', details: err.message });
  }
}

// Отклонение конкретного слота из запроса
export async function rejectSlot(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const userId = req.userId;
    const { slotIndex } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const request = await prisma.slotRequest.findFirst({
      where: { 
        id: requestId
      }
    });

    if (!request || !canAccessSlotRequest(req, request.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    if (slotIndex !== undefined) {
      const slots = request.proposedSlots as any[];
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
        return res.status(400).json({ error: 'Некорректный индекс слота' });
      }

      const newSlots = slots.map((slot, idx) => (
        idx === slotIndex
          ? { ...normalizeSlot(slot), status: 'CANCELLED' }
          : normalizeSlot(slot)
      ));
      
      const updated = await prisma.slotRequest.update({
        where: { id: requestId },
        data: {
          proposedSlots: newSlots,
          status: getNextRequestStatus(newSlots, request.status),
        }
      });

      await cancelLessonsForCancelledSlots({
        userId: request.userId,
        clientId: request.clientId,
        status: updated.status,
        proposedSlots: updated.proposedSlots,
      });
    } else {
      const cancelledSlots = setSlotsStatus(request.proposedSlots, 'CANCELLED');
      // Отклоняем весь запрос
      await prisma.slotRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          proposedSlots: cancelledSlots,
        }
      });

      await cancelLessonsForCancelledSlots({
        userId: request.userId,
        clientId: request.clientId,
        status: 'CANCELLED',
        proposedSlots: cancelledSlots,
      });
    }

    console.log(`✅ Слот/запрос ${requestId} отклонен`);

    res.json({ message: 'Запрос отклонен' });
  } catch (err: any) {
    console.error('❌ Ошибка при отклонении слота:', err);
    res.status(500).json({ error: 'Ошибка при отклонении слота', details: err.message });
  }
}

export async function restoreSlot(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const slotIndex = Number(req.params.slotIndex);
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      return res.status(400).json({ error: 'Некорректный индекс слота' });
    }

    const request = await prisma.slotRequest.findFirst({
      where: { id: requestId }
    });

    if (!request || !canAccessSlotRequest(req, request.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    const slots = Array.isArray(request.proposedSlots) ? request.proposedSlots : [];
    if (slotIndex >= slots.length) {
      return res.status(400).json({ error: 'Некорректный индекс слота' });
    }

    const restoredSlots = slots.map((slot, idx) => (
      idx === slotIndex
        ? { ...normalizeSlot(slot), status: 'PENDING' }
        : normalizeSlot(slot)
    ));

    const updated = await prisma.slotRequest.update({
      where: { id: requestId },
      data: {
        status: getNextRequestStatus(restoredSlots, 'PENDING'),
        proposedSlots: restoredSlots,
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            vip: true,
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          }
        }
      }
    });

    res.json({ message: 'Слот восстановлен', request: updated });
  } catch (err: any) {
    console.error('❌ Ошибка при восстановлении слота:', err);
    res.status(500).json({ error: 'Ошибка при восстановлении слота', details: err.message });
  }
}

export async function cancelSlotSelection(req: Request, res: Response) {
  try {
    const requestId = Number(req.params.id);
    const slotIndex = Number(req.params.slotIndex);
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      return res.status(400).json({ error: 'Некорректный индекс слота' });
    }

    const request = await prisma.slotRequest.findFirst({
      where: { id: requestId },
    });

    if (!request || !canAccessSlotRequest(req, request.userId)) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    const slots = Array.isArray(request.proposedSlots) ? request.proposedSlots : [];
    if (slotIndex >= slots.length) {
      return res.status(400).json({ error: 'Некорректный индекс слота' });
    }

    const selectedSlot = normalizeSlot(slots[slotIndex]);
    const selectedLesson = selectedSlot?.lessonId
      ? await prisma.lesson.findFirst({
          where: {
            id: Number(selectedSlot.lessonId),
            userId: request.userId,
            clientId: request.clientId,
            status: 'PLANNED',
          },
        })
      : (await prisma.lesson.findMany({
          where: {
            userId: request.userId,
            clientId: request.clientId,
            status: 'PLANNED',
          },
        })).find(lesson => slotMatchesLesson(selectedSlot, lesson));

    const restoredSlots = slots.map((slot, idx) => (
      idx === slotIndex
        ? { ...normalizeSlot(slot), status: 'PENDING' }
        : normalizeSlot(slot)
    ));

    const updated = await prisma.$transaction(async (tx) => {
      if (selectedLesson) {
        await tx.lesson.update({
          where: { id: selectedLesson.id },
          data: { status: 'CANCELLED' },
        });
      }

      return tx.slotRequest.update({
        where: { id: requestId },
        data: {
          status: getNextRequestStatus(restoredSlots, 'PENDING'),
          proposedSlots: restoredSlots as any,
        },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              vip: true,
            }
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            }
          }
        }
      });
    });

    res.json({
      message: selectedLesson
        ? 'Выбор отменен, занятие переведено в отмененные'
        : 'Выбор отменен, связанное запланированное занятие не найдено',
      cancelledLessonId: selectedLesson?.id ?? null,
      request: updated,
    });
  } catch (err: any) {
    console.error('❌ Ошибка при отмене выбора слота:', err);
    res.status(500).json({ error: 'Ошибка при отмене выбора слота', details: err.message });
  }
}
