import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Schedule Events API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/schedule-events создает личное событие без clientId', async () => {
    const res = await request(app)
      .post('/api/schedule-events')
      .set(authHeader(seed.teacher))
      .send({
        title: 'Личное дело',
        startTime: '2026-07-17T15:00:00+03:00',
        durationMin: 45,
        type: 'PERSONAL',
        location: 'Уфа, улица Мира, 1',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Личное дело');
    expect(res.body.type).toBe('PERSONAL');
    expect(res.body).not.toHaveProperty('clientId');
  });

  it('POST /api/schedule-events отклоняет событие поверх занятия', async () => {
    const res = await request(app)
      .post('/api/schedule-events')
      .set(authHeader(seed.teacher))
      .send({
        title: 'Конфликтное событие',
        startTime: '2026-07-15T10:30:00+03:00',
        durationMin: 30,
        type: 'PERSONAL',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Конфликт/);
  });

  it('PATCH /api/schedule-events/:id/status отменяет и восстанавливает событие', async () => {
    const cancelled = await request(app)
      .patch(`/api/schedule-events/${seed.event.id}/status`)
      .set(authHeader(seed.teacher))
      .send({ status: 'CANCELLED' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const restored = await request(app)
      .patch(`/api/schedule-events/${seed.event.id}/status`)
      .set(authHeader(seed.teacher))
      .send({ status: 'ACTIVE' });

    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('ACTIVE');
  });
});
