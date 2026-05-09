interface LessonReminderPayload {
  chatId?: string | null;
  recipientLabel: string;
  clientName: string;
  clientAddress?: string | null;
  startTime: Date;
  durationMin: number;
}

interface TelegramSendResult {
  skipped: boolean;
  success: boolean;
  status?: number;
  error?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: {
      id: number | string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
}

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';

function describeNetworkError(error: any) {
  const parts = [
    error?.name,
    error?.message,
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean);

  return parts.length ? parts.join(': ') : 'Unknown network error';
}

function normalizeBotUsername(username?: string | null) {
  const normalized = String(username || '').trim().replace(/^@+/, '');
  return normalized || null;
}

function formatLessonDate(date: Date) {
  return date.toLocaleDateString('ru-RU', {
    timeZone: process.env.TZ || 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatLessonTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', {
    timeZone: process.env.TZ || 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class TelegramNotificationService {
  private readonly token?: string;
  private botUsernameCache?: string | null;

  constructor(token = process.env.TELEGRAM_BOT_TOKEN) {
    this.token = token;
    this.botUsernameCache = normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  }

  hasToken() {
    return Boolean(this.token);
  }

  buildLessonReminderText(payload: LessonReminderPayload) {
    const addressPart = payload.clientAddress?.trim()
      ? `, Адрес клиента: ${payload.clientAddress.trim()}`
      : '';

    return [
      `Напоминание о занятии: ${payload.clientName}`,
      addressPart,
      `, Дата занятия: ${formatLessonDate(payload.startTime)}`,
      `, Время занятия: ${formatLessonTime(payload.startTime)}`,
      `, Длительность занятия: ${payload.durationMin} мин.`,
    ].join('');
  }

  private getApiUrl(method: string) {
    return `${TELEGRAM_API_BASE_URL}/bot${this.token}/${method}`;
  }

  private async request<T>(method: string, body: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    if (!this.token) {
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' };
    }

    let response: Response;
    try {
      response = await fetch(this.getApiUrl(method), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error: any) {
      throw new Error(describeNetworkError(error));
    }

    const data = await response.json().catch(() => null) as TelegramApiResponse<T> | null;
    if (!response.ok) {
      return {
        ok: false,
        error_code: response.status,
        description: data?.description || `HTTP ${response.status}`,
      };
    }

    return data || { ok: false, description: 'Telegram returned empty response' };
  }

  async sendMessage(chatId: string | number | null | undefined, text: string): Promise<TelegramSendResult> {
    if (!this.token) {
      console.log('[Telegram] TELEGRAM_BOT_TOKEN не задан, отправка пропущена');
      return { skipped: true, success: false, error: 'TELEGRAM_BOT_TOKEN is not configured' };
    }

    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId) {
      console.log('[Telegram] telegramChatId не задан, отправка пропущена');
      return { skipped: true, success: false, error: 'telegramChatId is not configured' };
    }

    try {
      const response = await this.request('sendMessage', {
        chat_id: normalizedChatId,
        text,
      });

      if (!response.ok) {
        const error = response.description || 'Telegram sendMessage failed';
        console.error(`[Telegram] Ошибка отправки в chat_id=${normalizedChatId}: ${error}`);
        return { skipped: false, success: false, status: response.error_code, error };
      }

      console.log(`[Telegram] Сообщение отправлено в chat_id=${normalizedChatId}`);
      return { skipped: false, success: true };
    } catch (error: any) {
      const message = error?.message || 'Unknown Telegram send error';
      console.error(`[Telegram] Ошибка запроса к Telegram Bot API: ${message}`);
      return { skipped: false, success: false, error: message };
    }
  }

  async sendLessonReminder(payload: LessonReminderPayload): Promise<TelegramSendResult> {
    const text = this.buildLessonReminderText(payload);
    const result = await this.sendMessage(payload.chatId, text);

    if (result.skipped) {
      console.log(`[Telegram] Напоминание для ${payload.recipientLabel} пропущено: ${result.error}`);
    } else if (result.success) {
      console.log(`[Telegram] Напоминание для ${payload.recipientLabel} отправлено`);
    }

    return result;
  }

  async getBotUsername(): Promise<string | null> {
    if (this.botUsernameCache) {
      return this.botUsernameCache;
    }

    if (!this.token) {
      return null;
    }

    try {
      const response = await this.request<TelegramBotInfo>('getMe', {});
      if (response.ok && response.result?.username) {
        const username = normalizeBotUsername(response.result.username);
        if (username) {
          this.botUsernameCache = username;
          return username;
        }
      }

      console.error(`[Telegram] Не удалось получить username бота: ${response.description || 'empty username'}`);
      return null;
    } catch (error: any) {
      console.error(`[Telegram] Ошибка getMe: ${error?.message || error}`);
      return null;
    }
  }

  async getUpdates(offset?: number, timeout = 25): Promise<TelegramUpdate[]> {
    if (!this.token) {
      return [];
    }

    const response = await this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message'],
    });

    if (!response.ok) {
      throw new Error(response.description || 'Telegram getUpdates failed');
    }

    return response.result || [];
  }
}

export const telegramNotificationService = new TelegramNotificationService();
