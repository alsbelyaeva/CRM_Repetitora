// src/controllers/usersController.ts
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import bcrypt from 'bcrypt';
import { getPasswordPolicyError } from '../utils/passwordPolicy';

// --- Получение всех пользователей (только для админов) ---
export const getAll = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.user?.role;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Только администраторы могут видеть всех пользователей
    if (currentUserRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Только администраторы могут просматривать список пользователей'
      });
    }

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        clients: {
          where: { deletedAt: null },
          select: {
            id: true,
            fullName: true,
            address: true,
            telegramChatId: true,
            email: true,
            vip: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            clients: true,
            lessons: true,
          },
        },
      }
    });
    
    console.log(`✅ Админ ${currentUserId} получил список пользователей (${users.length})`);
    
    res.json(users);
  } catch (err: any) {
    console.error('❌ Ошибка при получении списка пользователей:', err);
    res.status(500).json({ error: 'Ошибка при получении списка пользователей', details: err.message });
  }
};

// --- Создание пользователя (администраторами) ---
export const create = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.user?.role;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Только администраторы могут создавать пользователей
    if (currentUserRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Только администраторы могут создавать пользователей'
      });
    }

    const { email, password, fullName, address, telegramChatId, role = 'TEACHER' } = req.body;

    // Валидация
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Проверка email формата
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Некорректный формат email' });
    }

    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      return res.status(400).json({ error: passwordPolicyError });
    }

    // Проверяем существование пользователя
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: fullName || null,
        address: address ? String(address).trim() : null,
        telegramChatId: telegramChatId ? String(telegramChatId).trim() : null,
        role: role as 'ADMIN' | 'TEACHER',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
      }
    });

    console.log(`✅ Админ ${currentUserId} создал пользователя: ${user.email}`);
    
    res.status(201).json(user);
  } catch (err: any) {
    console.error('❌ Ошибка при создании пользователя:', err);
    res.status(500).json({ error: 'Ошибка при создании пользователя', details: err.message });
  }
};

// --- Получение одного пользователя ---
export const getById = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.user?.role;
    const targetUserId = req.params.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Проверка прав доступа: пользователь может видеть свои данные, админ - любые
    if (currentUserRole !== 'ADMIN' && currentUserId !== targetUserId) {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Вы можете просматривать только свои данные'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      }
    });
    
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(user);
  } catch (err: any) {
    console.error('❌ Ошибка при получении пользователя:', err);
    res.status(500).json({ error: 'Ошибка при получении пользователя', details: err.message });
  }
};

// --- Обновление пользователя ---
export const update = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.user?.role;
    const targetUserId = req.params.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Проверка прав доступа: пользователь может обновлять свои данные, админ - любые
    if (currentUserRole !== 'ADMIN' && currentUserId !== targetUserId) {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Вы можете обновлять только свои данные'
      });
    }

    const { email, fullName, address, telegramChatId, role, password } = req.body;
    
    const updateData: any = {};
    
    // Обновление email
    if (email !== undefined) {
      // Проверяем уникальность email
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email,
          NOT: { id: targetUserId }
        }
      });
      
      if (existingUser) {
        return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      }
      updateData.email = email;
    }
    
    // Обновление имени
    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }

    if (address !== undefined) {
      updateData.address = address ? String(address).trim() : null;
    }

    if (telegramChatId !== undefined) {
      updateData.telegramChatId = telegramChatId ? String(telegramChatId).trim() : null;
    }
    
    // Обновление роли (только для админов)
    if (role !== undefined && currentUserRole === 'ADMIN') {
      updateData.role = role;
    }
    
    // Обновление пароля
    if (password !== undefined) {
      const passwordPolicyError = getPasswordPolicyError(password);
      if (passwordPolicyError) {
        return res.status(400).json({ error: passwordPolicyError });
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    console.log(`✅ Пользователь ${targetUserId} обновлен пользователем ${currentUserId}`);
    
    res.json(user);
  } catch (err: any) {
    console.error('❌ Ошибка при обновлении пользователя:', err);
    res.status(500).json({ error: 'Ошибка при обновлении пользователя', details: err.message });
  }
};

// --- Мягкое удаление пользователя ---
export const remove = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.user?.role;
    const targetUserId = req.params.id;
    
    if (!currentUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Только администраторы могут удалять пользователей
    if (currentUserRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'Доступ запрещен',
        details: 'Только администраторы могут удалять пользователей'
      });
    }
    
    // Администратор не может удалить сам себя
    if (currentUserId === targetUserId) {
      return res.status(400).json({ 
        error: 'Невозможно удалить самого себя',
        details: 'Администратор не может удалить свой аккаунт'
      });
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: { deletedAt: new Date() },
      select: {
        id: true,
        email: true,
        fullName: true,
      }
    });
    
    console.log(`✅ Пользователь ${targetUserId} удален администратором ${currentUserId}`);
    
    res.status(200).json({ 
      message: 'Пользователь удален',
      user 
    });
  } catch (err: any) {
    console.error('❌ Ошибка при удалении пользователя:', err);
    res.status(500).json({ error: 'Ошибка при удалении пользователя', details: err.message });
  }
};

// --- Получение своего профиля ---
export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(user);
  } catch (err: any) {
    console.error('❌ Ошибка при получении профиля:', err);
    res.status(500).json({ error: 'Ошибка при получении профиля', details: err.message });
  }
};
