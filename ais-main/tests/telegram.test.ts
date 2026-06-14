import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Telegram API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/telegram/test-message сообщает, что Telegram не подключен к преподавателю', async () => {
    const res = await request(app)
      .post('/api/telegram/test-message')
      .set(authHeader(seed.teacher))
      .send();

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TELEGRAM_NOT_CONNECTED');
    expect(res.body.error).toMatch(/Telegram не подключ/);
  });

  it('POST /api/telegram/test-message позволяет администратору проверить выбранного преподавателя', async () => {
    const res = await request(app)
      .post('/api/telegram/test-message')
      .set(authHeader(seed.admin))
      .send({ userId: seed.teacher.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TELEGRAM_NOT_CONNECTED');
  });
});
