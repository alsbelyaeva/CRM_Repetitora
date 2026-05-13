import prisma from '../utils/prismaClient';
import { telegramNotificationService, TelegramUpdate } from './TelegramNotificationService';

let pollingStarted = false;
let pollingStopped = false;
let nextOffset: number | undefined;
let consecutivePollingErrors = 0;

const FALLBACK_AFTER_ERRORS = 3;
const POLLING_RETRY_DELAY_MS = 10_000;

function getConfiguredLongPollingTimeout() {
  const raw = Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 5);
  if (!Number.isFinite(raw) || raw < 0) {
    return 5;
  }

  return Math.min(Math.floor(raw), 25);
}

function getCurrentPollingTimeout() {
  return consecutivePollingErrors >= FALLBACK_AFTER_ERRORS
    ? 0
    : getConfiguredLongPollingTimeout();
}

function parseStartPayload(text: string | undefined) {
  if (!text) return null;

  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
  const payload = match?.[1]?.trim();
  if (!payload) return null;

  if (payload.startsWith('teacher_')) {
    return { type: 'teacher' as const, id: payload.slice('teacher_'.length) };
  }

  if (payload.startsWith('client_')) {
    return { type: 'client' as const, id: payload.slice('client_'.length) };
  }

  return null;
}

async function handleStartCommand(update: TelegramUpdate) {
  const message = update.message;
  const payload = parseStartPayload(message?.text);
  const chatId = message?.chat?.id;

  if (!payload || chatId === undefined || chatId === null) {
    return;
  }

  const telegramChatId = String(chatId);

  if (payload.type === 'teacher') {
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, fullName: true, email: true, role: true },
    }).catch(() => null);

    if (!user) {
      console.log(`[Telegram] /start teacher: пользователь ${payload.id} не найден`);
      await telegramNotificationService.sendMessage(telegramChatId, 'Не удалось подключить Telegram: пользователь не найден.');
      return;
    }

    if (user.role !== 'TEACHER') {
      console.log(`[Telegram] /start teacher: пользователь ${payload.id} имеет роль ${user.role}, подключение отклонено`);
      await telegramNotificationService.sendMessage(
        telegramChatId,
        'Telegram-уведомления по занятиям доступны только для аккаунта преподавателя.'
      );
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId },
    });

    console.log(`[Telegram] Подключен преподаватель ${user.id} к chat_id=${telegramChatId}`);
    await telegramNotificationService.sendMessage(telegramChatId, 'Telegram подключен к аккаунту преподавателя.');
    return;
  }

  const clientId = Number(payload.id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    console.log(`[Telegram] /start client: некорректный clientId=${payload.id}`);
    await telegramNotificationService.sendMessage(telegramChatId, 'Не удалось подключить Telegram: некорректный клиент.');
    return;
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { telegramChatId },
    select: { id: true, fullName: true },
  }).catch(() => null);

  if (!client) {
    console.log(`[Telegram] /start client: клиент ${clientId} не найден`);
    await telegramNotificationService.sendMessage(telegramChatId, 'Не удалось подключить Telegram: клиент не найден.');
    return;
  }

  console.log(`[Telegram] Подключен клиент ${client.id} к chat_id=${telegramChatId}`);
  await telegramNotificationService.sendMessage(telegramChatId, 'Telegram подключен к карточке клиента.');
}

async function pollOnce(timeoutSeconds: number) {
  const updates = await telegramNotificationService.getUpdates(nextOffset, timeoutSeconds);

  for (const update of updates) {
    nextOffset = update.update_id + 1;
    await handleStartCommand(update);
  }
}

async function pollingLoop() {
  while (!pollingStopped) {
    const timeoutSeconds = getCurrentPollingTimeout();

    try {
      await pollOnce(timeoutSeconds);
      if (consecutivePollingErrors >= FALLBACK_AFTER_ERRORS && timeoutSeconds === 0) {
        console.log('[Telegram] getUpdates снова доступен, возвращаем long polling');
      }
      consecutivePollingErrors = 0;
    } catch (error: any) {
      consecutivePollingErrors += 1;
      const mode = timeoutSeconds === 0 ? 'short polling' : 'long polling';
      console.error(`[Telegram] Ошибка ${mode}: ${error?.message || error}`);

      if (consecutivePollingErrors === FALLBACK_AFTER_ERRORS) {
        console.log('[Telegram] Переключаем getUpdates в короткий polling, чтобы обходить обрывы долгого соединения');
      }

      await new Promise(resolve => setTimeout(resolve, POLLING_RETRY_DELAY_MS));
    }
  }
}

export function startTelegramUpdatePolling() {
  if (pollingStarted) {
    return;
  }

  if (process.env.TELEGRAM_POLLING_ENABLED === 'false') {
    console.log('[Telegram] Long polling отключен через TELEGRAM_POLLING_ENABLED=false');
    return;
  }

  if (!telegramNotificationService.hasToken()) {
    console.log('[Telegram] TELEGRAM_BOT_TOKEN не задан, long polling не запущен');
    return;
  }

  pollingStarted = true;
  pollingStopped = false;
  consecutivePollingErrors = 0;
  console.log(`[Telegram] getUpdates polling запущен, timeout ${getConfiguredLongPollingTimeout()} сек.`);
  pollingLoop();
}

export function stopTelegramUpdatePolling() {
  pollingStopped = true;
  pollingStarted = false;
}
