import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { telegramNotificationService } from '../services/TelegramNotificationService';

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

export default router;
