import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { toAuditJson } from '../services/auditLogService';

function parsePositiveInt(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function buildIncludeUser() {
  return {
    user: {
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    },
  };
}

export async function getAll(req: Request, res: Response) {
  try {
    const currentUserId = req.userId;
    const userRole = req.user?.role;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const page = parsePositiveInt(req.query.page, 1);
    const offset = req.query.offset !== undefined
      ? parsePositiveInt(req.query.offset, 0)
      : (page - 1) * limit;
    const requestedUserId = typeof req.query.userId === 'string' && req.query.userId.trim()
      ? req.query.userId.trim()
      : undefined;

    const where = userRole === 'ADMIN'
      ? (requestedUserId ? { userId: requestedUserId } : {})
      : { userId: currentUserId };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: buildIncludeUser(),
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('Ошибка при получении логов:', err);
    res.status(500).json({
      error: 'Ошибка при получении логов',
      details: err.message,
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }

    const currentUserId = req.userId;
    const userRole = req.user?.role;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: buildIncludeUser(),
    });

    if (!log) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    if (userRole !== 'ADMIN' && log.userId !== currentUserId) {
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: 'Вы можете просматривать только свои логи',
      });
    }

    res.json(log);
  } catch (err: any) {
    console.error('Ошибка при получении записи аудита:', err);
    res.status(500).json({
      error: 'Ошибка при получении записи аудита',
      details: err.message,
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const currentUserId = req.userId;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: 'Создание произвольных записей аудита доступно только администратору',
      });
    }

    const { action, entity, entityId, userId, details } = req.body;

    if (!action || !entity) {
      return res.status(400).json({
        error: 'Обязательные поля: action, entity',
      });
    }

    const targetUserId = typeof userId === 'string' && userId.trim()
      ? userId.trim()
      : currentUserId;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    const log = await prisma.auditLog.create({
      data: {
        userId: targetUserId,
        action: String(action),
        entity: String(entity),
        entityId: entityId === undefined || entityId === null ? null : String(entityId),
        details: toAuditJson(details),
      },
      include: buildIncludeUser(),
    });

    res.status(201).json(log);
  } catch (err: any) {
    console.error('Ошибка при создании записи аудита:', err);
    res.status(500).json({
      error: 'Ошибка при создании записи аудита',
      details: err.message,
    });
  }
}
