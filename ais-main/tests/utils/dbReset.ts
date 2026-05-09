import { PrismaClient } from '@prisma/client';

export function getTestDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required. Refusing to use working DATABASE_URL.');
  }
  return url;
}

export function assertSafeTestDatabaseUrl(url = getTestDatabaseUrl()) {
  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();

  if (!databaseName.includes('test') && !databaseName.includes('ais_test')) {
    throw new Error(
      `Unsafe test database "${databaseName}". The database name must contain "test" or "ais_test".`
    );
  }
}

assertSafeTestDatabaseUrl();

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: getTestDatabaseUrl(),
    },
  },
});

export async function resetDatabase() {
  assertSafeTestDatabaseUrl();

  const tables = [
    '"TelegramNotificationLog"',
    '"PasswordResetToken"',
    '"Notification"',
    '"AuditLog"',
    '"SlotWeight"',
    '"SlotRequest"',
    '"Payment"',
    '"Lesson"',
    '"RecurringSeries"',
    '"ScheduleEvent"',
    '"Client"',
    '"User"',
  ];

  for (const table of tables) {
    try {
      await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`);
    } catch (e) {
      console.warn(`Не удалось очистить ${table}:`, e);
    }
  }
}
