import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

// CREATE
export const createNotification = async (req: Request, res: Response) => {
  try {
    const { userId, title, message } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({
        error: 'userId, title и message обязательны',
      });
    }

		const notification = await prisma.notification.create({
	  data: {
		title: String(title),
		message: String(message),
		user: {           // связываем с существующим пользователем
		  connect: { id: userId }
		},
	  },
	});


    res.status(201).json(notification);
  } catch (error) {
    console.error('Ошибка создания уведомления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// READ — все уведомления пользователя
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId);

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notifications);
  } catch (error) {
    console.error('Ошибка получения уведомлений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// UPDATE — отметить как прочитанное
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json(notification);
  } catch (error) {
    console.error('Ошибка обновления уведомления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// DELETE
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.notification.delete({
      where: { id },
    });

    res.json({ message: 'Удалено' });
  } catch (error) {
    console.error('Ошибка удаления уведомления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
