import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { telegramNotificationService } from '../services/TelegramNotificationService';
import prisma from '../utils/prismaClient';

const router = Router();

router.get('/bot-info', authMiddleware, async (_req, res) => {
  const username = await telegramNotificationService.getBotUsername();
  const configured = telegramNotificationService.hasToken();

  res.json({
    configured,
    username,
    message: username
      ? null
      : configured
        ? 'Username Telegram-бота не задан. Добавьте TELEGRAM_BOT_USERNAME в .env или проверьте доступ backend к Telegram getMe.'
        : 'TELEGRAM_BOT_TOKEN не задан. Укажите токен и TELEGRAM_BOT_USERNAME в .env.',
  });
});

router.post('/test-message', authMiddleware, async (req, res) => {
  try {
    const requestedUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const targetUserId = req.user?.role === 'ADMIN' && requestedUserId
      ? requestedUserId
      : req.userId;

    if (!targetUserId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (req.user?.role !== 'ADMIN' && requestedUserId && requestedUserId !== req.userId) {
      return res.status(403).json({
        error: 'Тестовое уведомление можно отправить только для своего аккаунта',
        code: 'FORBIDDEN_TARGET',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        telegramChatId: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Пользователь не найден',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.role !== 'TEACHER') {
      return res.status(400).json({
        error: 'Telegram-напоминания по занятиям доступны для аккаунта преподавателя',
        code: 'TELEGRAM_TEACHER_REQUIRED',
      });
    }

    if (!user.telegramChatId) {
      return res.status(400).json({
        error: 'Telegram не подключён к аккаунту преподавателя. Откройте бота по персональной ссылке и нажмите Start.',
        code: 'TELEGRAM_NOT_CONNECTED',
      });
    }

    if (!telegramNotificationService.hasToken()) {
      return res.status(503).json({
        error: 'Telegram-бот не настроен: TELEGRAM_BOT_TOKEN не задан на backend',
        code: 'TELEGRAM_TOKEN_MISSING',
      });
    }

    const result = await telegramNotificationService.sendMessage(
      user.telegramChatId,
      [
        'Тестовое уведомление CRM Репетитора.',
        `Аккаунт: ${user.fullName || user.email}.`,
        'Если это сообщение пришло, Telegram-бот подключён и может отправлять уведомления.',
      ].join('\n')
    );

    if (result.success) {
      return res.json({
        message: 'Тестовое уведомление отправлено в Telegram',
        code: 'TELEGRAM_TEST_SENT',
      });
    }

    return res.status(502).json({
      error: 'Telegram-бот не смог отправить тестовое сообщение',
      details: result.error,
      code: 'TELEGRAM_SEND_FAILED',
    });
  } catch (error: any) {
    console.error('[Telegram] Ошибка тестовой отправки:', error);
    return res.status(500).json({
      error: 'Ошибка при отправке тестового Telegram-уведомления',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message,
      code: 'TELEGRAM_TEST_ERROR',
    });
  }
});

export default router;
