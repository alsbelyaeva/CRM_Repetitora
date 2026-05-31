import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Slot Weights API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('GET /api/slot-weights/:userId возвращает веса своего пользователя', async () => {
    const res = await request(app)
      .get(`/api/slot-weights/${seed.teacher.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(seed.teacher.id);
    expect(res.body.wWorkingDay).toBeCloseTo(0.2);
  });

  it('PUT /api/slot-weights/:userId обновляет веса своего пользователя', async () => {
    const res = await request(app)
      .put(`/api/slot-weights/${seed.teacher.id}`)
      .set(authHeader(seed.teacher))
      .send({
        wTime: 0.3,
        wCompact: 0.25,
        wWorkingDay: 0.2,
        wPriority: 0.1,
        wTravel: 0.15,
        desiredBreakMinutes: 45,
        maxTravelMinutes: 90,
      });

    expect(res.status).toBe(200);
    expect(res.body.desiredBreakMinutes).toBe(45);
    expect(res.body.maxTravelMinutes).toBe(90);
  });

  it('PUT /api/slot-weights/:userId отклоняет нулевую сумму весов ранжирования', async () => {
    const res = await request(app)
      .put(`/api/slot-weights/${seed.teacher.id}`)
      .set(authHeader(seed.teacher))
      .send({
        wTime: 0,
        wCompact: 0,
        wWorkingDay: 0,
        wPriority: 0,
        wTravel: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('больше 0');
  });

  it('PUT /api/slot-weights/:userId отклоняет отрицательное максимальное время дороги', async () => {
    const res = await request(app)
      .put(`/api/slot-weights/${seed.teacher.id}`)
      .set(authHeader(seed.teacher))
      .send({
        maxTravelMinutes: -1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('maxTravelMinutes');
  });

  it('GET /api/slot-weights возвращает все веса только администратору', async () => {
    const teacherRes = await request(app)
      .get('/api/slot-weights')
      .set(authHeader(seed.teacher));
    expect(teacherRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/slot-weights')
      .set(authHeader(seed.admin));
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body)).toBe(true);
  });
});
