import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { getChangedFields, logAuditAction } from '../services/auditLogService';

export async function getAll(req: Request, res: Response) {
  try {
    console.log('🔧 [Clients.getAll] Запрос от пользователя:', req.userId);
    console.log('🔧 [Clients.getAll] Роль пользователя:', req.user?.role);
    
    const userId = req.userId;
    const userRole = req.user?.role;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    
    if (!userId) {
      console.log('❌ [Clients.getAll] ОШИБКА: userId не определен');
      return res.status(401).json({ 
        error: 'Не авторизован',
        details: 'Требуется аутентификация'
      });
    }

    // Определяем условие WHERE в зависимости от роли
    let whereCondition: any = {
      deletedAt: null,
    };
    
    // АДМИН ВИДИТ ВСЕХ КЛИЕНТОВ
    if (userRole === 'ADMIN') {
      if (requestedUserId) {
        whereCondition.userId = requestedUserId;
      }
      console.log('👑 [Clients.getAll] Админ запрашивает всех клиентов');
      // Нет дополнительной фильтрации - админ видит всех
    } else {
      // Преподаватель видит только своих клиентов
      whereCondition.userId = userId;
      console.log('👤 [Clients.getAll] Преподаватель запрашивает своих клиентов');
    }
    
    console.log(`🔍 [Clients.getAll] Условие поиска:`, whereCondition);
    
    const clients = await prisma.client.findMany({
      where: whereCondition,
      select: {
        id: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        email: true,
        phone: true,
        notes: true,
        vip: true,
        tags: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          }
        },
        _count: {
          select: {
            lessons: true,
            payments: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    
    console.log(`✅ [Clients.getAll] Найдено ${clients.length} клиентов для пользователя ${userId} (роль: ${userRole})`);
    
    res.json(clients);
  } catch (error: any) {
    console.error('❌ [Clients.getAll] Ошибка:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    
    res.status(500).json({ 
      error: 'Ошибка при получении клиентов',
      details: error.message 
    });
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID клиента' });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    let whereCondition: any = { 
      id: id,
      deletedAt: null 
    };
    
    // АДМИН МОЖЕТ ВИДЕТЬ ЛЮБОГО КЛИЕНТА
    if (userRole !== 'ADMIN') {
      whereCondition.userId = userId;
    }

    const client = await prisma.client.findFirst({
      where: whereCondition,
      select: {
        id: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        email: true,
        phone: true,
        notes: true,
        vip: true,
        tags: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          }
        },
        lessons: {
          orderBy: {
            startTime: 'desc'
          },
          take: 20,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              }
            }
          }
        },
        payments: {
          orderBy: {
            dateTime: 'desc'
          },
          take: 20
        }
      }
    });
    
    if (!client) {
      return res.status(404).json({ 
        error: 'Клиент не найден',
        message: userRole !== 'ADMIN' ? 'Клиент не найден или не принадлежит вам' : 'Клиент не найден'
      });
    }

    res.json(client);
  } catch (error: any) {
    console.error('❌ Ошибка при получении клиента:', error);
    res.status(500).json({ error: 'Ошибка при получении клиента', details: error.message });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const userRole = req.user?.role;
    
    console.log('🔧 [Clients.create] Создание клиента для пользователя:', userId);
    
    if (!userId) {
      console.log('❌ [Clients.create] ОШИБКА: userId не определен');
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const { fullName, address, telegramChatId, email, phone, notes, vip, tags, assignedTeacherId } = req.body;
    
    console.log('📦 Данные клиента:', { fullName, address, email, phone, vip, assignedTeacherId });

    // Валидация
    if (!fullName || fullName.trim().length === 0) {
      return res.status(400).json({ error: 'Имя клиента обязательно' });
    }

    // Определяем к какому преподавателю привязать клиента
    let targetUserId = userId;
    
    // АДМИН МОЖЕТ СОЗДАТЬ КЛИЕНТА ДЛЯ ЛЮБОГО ПРЕПОДАВАТЕЛЯ
    if (userRole === 'ADMIN' && assignedTeacherId) {
      // Проверяем что указанный преподаватель существует
      const teacher = await prisma.user.findUnique({
        where: { 
          id: assignedTeacherId,
          role: 'TEACHER',
          deletedAt: null
        }
      });
      
      if (!teacher) {
        return res.status(400).json({ 
          error: 'Указанный преподаватель не найден или не является преподавателем' 
        });
      }
      
      targetUserId = assignedTeacherId;
      console.log(`👑 Админ создает клиента для преподавателя: ${targetUserId}`);
    } else if (userRole !== 'ADMIN' && assignedTeacherId) {
      // Обычный преподаватель не может назначать клиентов другим
      return res.status(403).json({ 
        error: 'Вы не можете создавать клиентов для других преподавателей' 
      });
    }

    // Проверяем существование пользователя-преподавателя
    const teacher = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true }
    });
    
    if (!teacher) {
      return res.status(401).json({ error: 'Преподаватель не найден' });
    }

    // Проверяем уникальность email (если email предоставлен)
    if (email && email.trim()) {
      const existingClient = await prisma.client.findFirst({
        where: {
          email: email.trim(),
          userId: targetUserId,
          deletedAt: null
        }
      });
      
      if (existingClient) {
        return res.status(409).json({ 
          error: 'Клиент с таким email уже существует у этого преподавателя' 
        });
      }
    }

    const client = await prisma.client.create({
      data: {
        fullName: fullName.trim(),
        address: address ? address.trim() : null,
        telegramChatId: telegramChatId ? String(telegramChatId).trim() : null,
        email: email ? email.trim() : null,
        phone: phone ? phone.trim() : null,
        notes: notes ? notes.trim() : null,
        vip: Boolean(vip),
        tags: tags || {},
        userId: targetUserId,
      },
      select: {
        id: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        email: true,
        phone: true,
        notes: true,
        vip: true,
        tags: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          }
        }
      }
    });
    
    console.log(`✅ [Clients.create] Клиент создан с ID: ${client.id} для преподавателя ${targetUserId}`);

    await logAuditAction({
      userId: targetUserId,
      action: 'client.create',
      entity: 'Client',
      entityId: client.id,
      details: {
        clientName: client.fullName,
        createdBy: userId,
        assignedTeacherId: targetUserId,
        vip: client.vip,
      },
    });
    
    res.status(201).json(client);
  } catch (error: any) {
    console.error('❌ [Clients.create] Ошибка при создании клиента:', error);
    
    // Обработка ошибок Prisma
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0];
      if (field === 'email') {
        return res.status(409).json({ error: 'Клиент с таким email уже существует' });
      }
      return res.status(409).json({ error: 'Нарушение уникальности', field });
    }
    
    res.status(500).json({ 
      error: 'Ошибка при создании клиента',
      details: error.message 
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID клиента' });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const { fullName, address, telegramChatId, email, phone, notes, vip, tags, assignedTeacherId } = req.body;

    // Проверяем существование клиента
    let whereCondition: any = { 
      id: id,
      deletedAt: null 
    };
    
    // АДМИН МОЖЕТ РЕДАКТИРОВАТЬ ЛЮБОГО КЛИЕНТА
    if (userRole !== 'ADMIN') {
      whereCondition.userId = userId;
    }
    
    const existingClient = await prisma.client.findFirst({
      where: whereCondition
    });
    
    if (!existingClient) {
      return res.status(404).json({ 
        error: 'Клиент не найден',
        message: userRole !== 'ADMIN' ? 'Клиент не найден или не принадлежит вам' : 'Клиент не найден'
      });
    }

    const updateData: any = {
      fullName: fullName !== undefined ? fullName.trim() : undefined,
      address: address !== undefined ? (address ? address.trim() : null) : undefined,
      telegramChatId: telegramChatId !== undefined ? (telegramChatId ? String(telegramChatId).trim() : null) : undefined,
      email: email !== undefined ? (email ? email.trim() : null) : undefined,
      phone: phone !== undefined ? (phone ? phone.trim() : null) : undefined,
      notes: notes !== undefined ? (notes ? notes.trim() : null) : undefined,
      vip: vip !== undefined ? Boolean(vip) : undefined,
      tags: tags !== undefined ? tags : undefined,
    };

    // АДМИН МОЖЕТ ПЕРЕНАЗНАЧИТЬ КЛИЕНТА ДРУГОМУ ПРЕПОДАВАТЕЛЮ
    if (assignedTeacherId !== undefined && userRole === 'ADMIN') {
      // Проверяем что указанный преподаватель существует
      const teacher = await prisma.user.findUnique({
        where: { 
          id: assignedTeacherId,
          role: 'TEACHER',
          deletedAt: null
        }
      });
      
      if (!teacher) {
        return res.status(400).json({ 
          error: 'Указанный преподаватель не найден или не является преподавателем' 
        });
      }
      
      updateData.userId = assignedTeacherId;
      console.log(`👑 Админ переназначает клиента ${id} преподавателю ${assignedTeacherId}`);
    } else if (assignedTeacherId !== undefined && userRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Вы не можете переназначать клиентов другим преподавателям' 
      });
    }

    const updated = await prisma.client.update({
      where: { id: id },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        email: true,
        phone: true,
        notes: true,
        vip: true,
        tags: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          }
        }
      }
    });

    console.log(`✅ Клиент ${id} обновлен пользователем ${userId} (роль: ${userRole})`);

    await logAuditAction({
      userId: updated.userId,
      action: 'client.update',
      entity: 'Client',
      entityId: updated.id,
      details: {
        clientName: updated.fullName,
        changedBy: userId,
        changedFields: getChangedFields(existingClient as any, updated as any, [
          'fullName',
          'address',
          'email',
          'phone',
          'notes',
          'vip',
          'tags',
          'userId',
        ]),
      },
    });
    
    res.json(updated);
  } catch (error: any) {
    console.error('❌ Ошибка при обновлении клиента:', error);
    res.status(500).json({ error: 'Ошибка при обновлении клиента', details: error.message });
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Некорректный ID клиента' });
    }

    const userId = req.userId;
    const userRole = req.user?.role;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    // Проверяем существование клиента
    let whereCondition: any = { 
      id: id,
      deletedAt: null 
    };
    
    // АДМИН МОЖЕТ УДАЛИТЬ ЛЮБОГО КЛИЕНТА
    if (userRole !== 'ADMIN') {
      whereCondition.userId = userId;
    }
    
    const existingClient = await prisma.client.findFirst({
      where: whereCondition
    });
    
    if (!existingClient) {
      return res.status(404).json({ 
        error: 'Клиент не найден',
        message: userRole !== 'ADMIN' ? 'Клиент не найден или не принадлежит вам' : 'Клиент не найден'
      });
    }

    const futurePlannedLesson = await prisma.lesson.findFirst({
      where: {
        status: 'PLANNED',
        startTime: {
          gte: new Date(),
        },
        OR: [
          { clientId: id },
          {
            participants: {
              some: {
                clientId: id,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        startTime: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    if (futurePlannedLesson) {
      return res.status(409).json({
        error: 'Нельзя удалить клиента, пока у него есть запланированные занятия',
        message: 'Сначала отмените или перенесите будущие занятия этого клиента.',
        lessonId: futurePlannedLesson.id,
        lessonStartTime: futurePlannedLesson.startTime,
      });
    }

    await prisma.client.update({
      where: { id: id },
      data: { deletedAt: new Date() },
    });
    
    console.log(`✅ Клиент ${id} помечен как удаленный пользователем ${userId} (роль: ${userRole})`);

    await logAuditAction({
      userId: existingClient.userId,
      action: 'client.delete',
      entity: 'Client',
      entityId: existingClient.id,
      details: {
        clientName: existingClient.fullName,
        deletedBy: userId,
      },
    });
    
    res.json({ message: 'Клиент помечен как удалён' });
  } catch (error: any) {
    console.error('❌ Ошибка при удалении клиента:', error);
    res.status(500).json({ error: 'Ошибка при удалении клиента', details: error.message });
  }
}
