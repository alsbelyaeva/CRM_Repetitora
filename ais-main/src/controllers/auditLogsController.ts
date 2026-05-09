import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

export async function getAll(req: Request, res: Response) {
  try {
    console.log('🔧 [AuditLogs.getAll] Запрос от пользователя:', req.userId);
    
    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    let logs;
    
    // Проверяем права доступа
    if (userRole === 'ADMIN') {
      // Администраторы видят все логи
      logs = await prisma.auditLog.findMany({
        include: { 
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true
            }
          } 
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      console.log(`✅ Админ ${userId} получил все логи (${logs.length} записей)`);
    } else {
      // Обычные пользователи видят только свои логи
      logs = await prisma.auditLog.findMany({
        where: { 
          userId: userId 
        },
        include: { 
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true
            }
          } 
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      console.log(`✅ Пользователь ${userId} получил свои логи (${logs.length} записей)`);
    }
    
    res.json(logs);
  } catch (err: any) {
    console.error('❌ Ошибка при получении логов:', err);
    res.status(500).json({ 
      error: 'Ошибка при получении логов', 
      details: err.message 
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: { 
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        } 
      },
    });

    if (!log) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    // Проверяем права доступа
    if (userRole !== 'ADMIN' && log.userId !== userId) {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Вы можете просматривать только свои логи'
      });
    }

    res.json(log);
  } catch (err: any) {
    console.error('❌ Ошибка при получении записи аудита:', err);
    res.status(500).json({
      error: 'Ошибка при получении записи аудита',
      details: err.message,
    });
  }
}

export async function create(req: Request, res: Response) {
  try {
    // userId берется из аутентифицированного пользователя, а не из тела запроса
    const userId = req.userId;
    const { action, entity, entityId, details } = req.body;

    console.log('📝 Создание лога аудита:', {
      userId,
      action,
      entity,
      entityId,
      details
    });

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Валидация обязательных полей
    if (!action || !entity) {
      return res.status(400).json({ 
        error: 'Обязательные поля: action, entity' 
      });
    }

    // Проверяем существование пользователя
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { id: true }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    const log = await prisma.auditLog.create({
      data: { 
        userId, // Используем userId из аутентификации
        action: String(action),
        entity: String(entity),
        entityId: entityId ? String(entityId) : null,
        details: details || {}
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    console.log(`✅ Запись аудита создана с ID: ${log.id}`);
    
    res.status(201).json(log);
  } catch (err: any) {
    console.error('❌ Ошибка при создании записи аудита:', err);
    
    if (err.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Ошибка внешнего ключа', 
        details: 'Пользователь не существует' 
      });
    }
    
    res.status(500).json({ 
      error: 'Ошибка при создании записи аудита', 
      details: err.message 
    });
  }
}

// Дополнительные функции (опционально)

export async function getByUser(req: Request, res: Response) {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.userId;
    const userRole = req.user?.role;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Проверяем права доступа
    if (userRole !== 'ADMIN' && targetUserId !== currentUserId) {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Вы можете просматривать только свои логи'
      });
    }

    const logs = await prisma.auditLog.findMany({
      where: { 
        userId: targetUserId 
      },
      include: { 
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        } 
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    console.log(`✅ Получено ${logs.length} логов для пользователя ${targetUserId}`);
    
    res.json(logs);
  } catch (err: any) {
    console.error('❌ Ошибка при получении логов пользователя:', err);
    res.status(500).json({ 
      error: 'Ошибка при получении логов пользователя',
      details: err.message 
    });
  }
}

export async function getMyLogs(req: Request, res: Response) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const logs = await prisma.auditLog.findMany({
      where: { 
        userId: userId 
      },
      include: { 
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        } 
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    console.log(`✅ Пользователь ${userId} получил свои логи (${logs.length} записей)`);
    
    res.json(logs);
  } catch (err: any) {
    console.error('❌ Ошибка при получении своих логов:', err);
    res.status(500).json({ 
      error: 'Ошибка при получении логов',
      details: err.message 
    });
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Только администраторы могут удалять логи
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Только администраторы могут удалять логи аудита'
      });
    }

    // Проверяем существование записи
    const log = await prisma.auditLog.findUnique({
      where: { id }
    });

    if (!log) {
      return res.status(404).json({ error: 'Запись аудита не найдена' });
    }

    await prisma.auditLog.delete({ where: { id } });
    
    console.log(`✅ Админ ${userId} удалил запись аудита ${id}`);
    
    res.json({ 
      message: 'Запись аудита удалена',
      deletedId: id 
    });
  } catch (err: any) {
    console.error('❌ Ошибка при удалении записи аудита:', err);
    res.status(500).json({ 
      error: 'Ошибка при удалении записи аудита',
      details: err.message 
    });
  }
}