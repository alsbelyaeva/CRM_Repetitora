import dns from 'dns/promises';

export type EmailDomainCheckResult =
  | { valid: true; skipped: boolean }
  | { valid: false; reason: 'missing_mx' | 'dns_error'; details?: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MX_LOOKUP_TIMEOUT_MS = 4000;
const RUSSIAN_EMAIL_DOMAIN_SUFFIXES = ['.ru', '.рф', '.su'];
const RUSSIAN_EMAIL_DOMAIN_ERROR = 'Регистрация доступна только с email на российских доменах (.ru, .рф, .su). Данную почту нельзя зарегистрировать.';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmailFormatValid(email: string) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

export function getEmailDomain(email: string) {
  return normalizeEmail(email).split('@')[1] || '';
}

export function isRussianEmailDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();
  return RUSSIAN_EMAIL_DOMAIN_SUFFIXES.some(suffix => normalizedDomain.endsWith(suffix));
}

function isEmailMxCheckDisabled() {
  return process.env.NODE_ENV === 'test' || process.env.EMAIL_MX_CHECK_DISABLED === 'true';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS MX lookup timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkEmailDomainMx(domain: string): Promise<EmailDomainCheckResult> {
  const normalizedDomain = domain.trim().toLowerCase();

  if (isEmailMxCheckDisabled()) {
    return { valid: true, skipped: true };
  }

  try {
    const records = await withTimeout(dns.resolveMx(normalizedDomain), MX_LOOKUP_TIMEOUT_MS);
    const usableRecords = records.filter(record => record.exchange && record.exchange !== '.');

    if (usableRecords.length === 0) {
      return { valid: false, reason: 'missing_mx' };
    }

    return { valid: true, skipped: false };
  } catch (error: any) {
    if (['ENODATA', 'ENOTFOUND'].includes(error?.code)) {
      return { valid: false, reason: 'missing_mx', details: error.code };
    }

    return {
      valid: false,
      reason: 'dns_error',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function validateAccountEmail(email: unknown) {
  if (!email || typeof email !== 'string') {
    return { valid: false as const, error: 'Email обязателен' };
  }

  const normalizedEmail = normalizeEmail(email);

  if (!isEmailFormatValid(normalizedEmail)) {
    return { valid: false as const, error: 'Некорректный формат email' };
  }

  const domain = getEmailDomain(normalizedEmail);

  if (!isRussianEmailDomain(domain)) {
    return { valid: false as const, error: RUSSIAN_EMAIL_DOMAIN_ERROR };
  }

  const domainCheck = await checkEmailDomainMx(domain);

  if (!domainCheck.valid) {
    return {
      valid: false as const,
      error: domainCheck.reason === 'missing_mx'
        ? 'У домена email не найден почтовый сервер. Укажите действующий email.'
        : 'Не удалось подтвердить наличие почтового сервера у домена email. Укажите действующий email или повторите позже.',
    };
  }

  return { valid: true as const, email: normalizedEmail };
}
