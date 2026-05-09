const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'qwertyui',
  'qwerty123',
  'password',
  'password1',
  'letmein1',
  'welcome1',
]);

const SIMPLE_SEQUENCES = [
  '12345678',
  '23456789',
  '87654321',
  '98765432',
  'abcdefgh',
  'qwertyui',
  'asdfghjk',
  'zxcvbnm',
];

export function getPasswordIssues(password: string): string[] {
  const issues: string[] = [];
  const normalized = password.toLowerCase();

  if (password.length < 8) {
    issues.push('минимум 8 символов');
  }

  if (!/[0-9]/.test(password)) {
    issues.push('хотя бы одну цифру');
  }

  if (!/[a-z]/.test(password)) {
    issues.push('строчную латинскую букву a-z');
  }

  if (!/[A-Z]/.test(password)) {
    issues.push('заглавную латинскую букву A-Z');
  }

  if (COMMON_WEAK_PASSWORDS.has(normalized) || SIMPLE_SEQUENCES.some(sequence => normalized.includes(sequence))) {
    issues.push('пароль без простых шаблонов вроде 12345678 или qwertyui');
  }

  return issues;
}

export function getPasswordPolicyError(password: string): string | null {
  const issues = getPasswordIssues(password);

  if (issues.length === 0) {
    return null;
  }

  return `Пароль недостаточно надежный. Добавьте: ${issues.join(', ')}.`;
}
