import { TelegramNotificationService } from '../src/services/TelegramNotificationService';
import { getPublicTransportTravelTime } from '../src/services/twoGisTravelService';
import { sendPasswordResetEmail } from '../src/services/mailService';
import { withoutEnv } from './utils/env';

describe('External integrations graceful degradation', () => {
  it('Telegram без TELEGRAM_BOT_TOKEN пропускает отправку без исключения', async () => {
    const service = new TelegramNotificationService(undefined);
    const result = await service.sendLessonReminder({
      chatId: '123',
      recipientLabel: 'Преподаватель',
      clientName: 'Client Test',
      clientAddress: 'Уфа, улица Пушкина, 5',
      startTime: new Date('2026-05-11T10:00:00+03:00'),
      durationMin: 60,
    });

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(false);
  });

  it('2GIS без TWO_GIS_API_KEY возвращает missing_api_key без исключения', async () => {
    await withoutEnv(['TWO_GIS_API_KEY'], async () => {
      const result = await getPublicTransportTravelTime(
        'Уфа, улица Ленина, 1',
        'Уфа, улица Пушкина, 5',
        new Date('2026-05-11T09:00:00+03:00')
      );

      expect(result.status).toBe('missing_api_key');
      expect(result.travelTimeMinutes).toBeNull();
    });
  });

  it('SMTP без настроек не ломает отправку ссылки сброса пароля', async () => {
    await withoutEnv(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'], async () => {
      const result = await sendPasswordResetEmail(
        'student@example.com',
        'http://localhost:5173/reset-password?token=test'
      );

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      if (!result.success) {
        expect(result.reason).toBe('smtp_not_configured');
      }
    });
  });
});
