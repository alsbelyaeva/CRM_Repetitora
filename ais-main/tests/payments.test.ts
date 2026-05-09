import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Payments API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/payments создает оплату', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        lessonId: seed.lesson.id,
        amount: 2000,
        method: 'card',
        dateTime: '2026-05-11T12:00:00+03:00',
        note: 'Тестовая оплата API',
      });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(2000);
    expect(res.body.client.id).toBe(seed.client.id);
  });

  it('GET /api/payments возвращает оплаты преподавателя', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(1500);
  });
});
