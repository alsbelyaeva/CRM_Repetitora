import prisma from '../utils/prismaClient';
import { telegramNotificationService } from './TelegramNotificationService';

const REMINDERS = [
  { type: '24h', minutesBefore: 24 * 60 },
  { type: '1h', minutesBefore: 60 },
] as const;

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_WINDOW_MINUTES = 10;

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;

function getIntervalMs() {
  const value = Number(process.env.TELEGRAM_REMINDER_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

function getWindowMinutes() {
  const value = Number(process.env.TELEGRAM_REMINDER_WINDOW_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_WINDOW_MINUTES;
}

function serializeError(error: string | undefined) {
  if (!error) return null;
  return error.length > 500 ? `${error.slice(0, 497)}...` : error;
}

async function processReminder(reminderType: string, minutesBefore: number) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + minutesBefore * 60_000);
  const windowEnd = new Date(windowStart.getTime() + getWindowMinutes() * 60_000);

  const lessons = await prisma.lesson.findMany({
    where: {
      status: 'PLANNED',
      startTime: {
        gte: windowStart,
        lt: windowEnd,
      },
    },
    include: {
      client: {
        select: {
          fullName: true,
          address: true,
          telegramChatId: true,
          userId: true,
          user: {
            select: {
              id: true,
              telegramChatId: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          telegramChatId: true,
        },
      },
    },
  });

  for (const lesson of lessons) {
    const teacherId = lesson.user?.id || lesson.client.user.id;
    const recipients = [
      {
        type: 'TEACHER',
        id: teacherId,
        chatId: lesson.user?.telegramChatId || lesson.client.user.telegramChatId,
        label: 'преподавателя',
      },
    ];

    if (lesson.client.telegramChatId) {
      recipients.push({
        type: 'CLIENT',
        id: String(lesson.clientId),
        chatId: lesson.client.telegramChatId,
        label: `клиента ${lesson.client.fullName}`,
      });
    } else {
      console.log(`[Telegram] telegramChatId клиента ${lesson.clientId} не задан, клиентское напоминание пропущено`);
    }

    for (const recipient of recipients) {
      const existingLog = await prisma.telegramNotificationLog.findUnique({
        where: {
          lessonId_reminderType_channel_recipientType_recipientId: {
            lessonId: lesson.id,
            reminderType,
            channel: 'TELEGRAM',
            recipientType: recipient.type,
            recipientId: recipient.id,
          },
        },
      });

      if (existingLog?.status === 'SENT') {
        continue;
      }

      const result = await telegramNotificationService.sendLessonReminder({
        chatId: recipient.chatId,
        recipientLabel: recipient.label,
        clientName: lesson.client.fullName,
        clientAddress: lesson.client.address,
        startTime: lesson.startTime,
        durationMin: lesson.durationMin,
      });

      const status = result.skipped ? 'SKIPPED' : result.success ? 'SENT' : 'FAILED';
      const error = serializeError(result.error);

      await prisma.telegramNotificationLog.upsert({
        where: {
          lessonId_reminderType_channel_recipientType_recipientId: {
            lessonId: lesson.id,
            reminderType,
            channel: 'TELEGRAM',
            recipientType: recipient.type,
            recipientId: recipient.id,
          },
        },
        update: {
          status,
          error,
          chatId: recipient.chatId || null,
          sentAt: new Date(),
        },
        create: {
          lessonId: lesson.id,
          reminderType,
          channel: 'TELEGRAM',
          recipientType: recipient.type,
          recipientId: recipient.id,
          chatId: recipient.chatId || null,
          status,
          error,
        },
      });

      console.log(`[Telegram] reminder=${reminderType} lesson=${lesson.id} recipient=${recipient.type}:${recipient.id} status=${status}`);
    }
  }
}

export async function runLessonReminderTick() {
  for (const reminder of REMINDERS) {
    await processReminder(reminder.type, reminder.minutesBefore);
  }
}

export function startLessonReminderScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  const intervalMs = getIntervalMs();

  console.log(`[Telegram] Планировщик напоминаний запущен, интервал ${Math.round(intervalMs / 1000)} сек.`);

  runLessonReminderTick().catch((error) => {
    console.error('[Telegram] Ошибка стартового тика напоминаний:', error);
  });

  schedulerTimer = setInterval(() => {
    runLessonReminderTick().catch((error) => {
      console.error('[Telegram] Ошибка тика напоминаний:', error);
    });
  }, intervalMs);

  schedulerTimer.unref?.();
}

export function stopLessonReminderScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}
