function assertSafeTestDatabaseUrl(url: string) {
  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, '').toLowerCase();

  if (!databaseName.includes('test') && !databaseName.includes('ais_test')) {
    throw new Error(
      `Unsafe TEST_DATABASE_URL: database name "${databaseName}" must contain "test" or "ais_test".`
    );
  }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for API tests. Refusing to use working DATABASE_URL.');
}

assertSafeTestDatabaseUrl(testDatabaseUrl);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
