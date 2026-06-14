import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Lessons API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/lessons создает одиночное занятие', async () => {
    const res = await request(app)
      .post('/api/lessons')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.secondClient.id,
        startTime: '2026-07-17T10:00:00+03:00',
        durationMin: 60,
        type: 'INDIVIDUAL',
      });

    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(seed.secondClient.id);
    expect(res.body.status).toBe('PLANNED');
  });

  it('POST /api/lessons создает групповое занятие с несколькими участниками', async () => {
    const res = await request(app)
      .post('/api/lessons')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        participantClientIds: [seed.client.id, seed.secondClient.id],
        startTime: '2026-07-17T11:30:00+03:00',
        durationMin: 60,
        type: 'Групповое',
      });

    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(seed.client.id);
    expect(res.body.participants).toHaveLength(2);
    expect(res.body.participants.map((participant: any) => participant.client.id).sort()).toEqual([
      seed.client.id,
      seed.secondClient.id,
    ].sort());

    const participants = await testPrisma.lessonParticipant.findMany({
      where: { lessonId: res.body.id },
      orderBy: { clientId: 'asc' },
    });
    expect(participants.map((participant) => participant.clientId)).toEqual([
      seed.client.id,
      seed.secondClient.id,
    ].sort((a, b) => a - b));
  });

  it('DELETE /api/lessons/:id отменяет занятие без удаления записи', async () => {
    const res = await request(app)
      .delete(`/api/lessons/${seed.lesson.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    const lesson = await testPrisma.lesson.findUnique({ where: { id: seed.lesson.id } });
    expect(lesson?.status).toBe('CANCELLED');
  });

  it('PATCH /api/lessons/:id/status восстанавливает отмененное занятие', async () => {
    await testPrisma.lesson.update({
      where: { id: seed.lesson.id },
      data: { status: 'CANCELLED' },
    });

    const res = await request(app)
      .patch(`/api/lessons/${seed.lesson.id}/status`)
      .set(authHeader(seed.teacher))
      .send({ status: 'PLANNED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PLANNED');
  });

  it('POST /api/lessons/recurring-series создает регулярную серию без конфликтов', async () => {
    const res = await request(app)
      .post('/api/lessons/recurring-series')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.secondClient.id,
        weekday: 4,
        startTime: '09:00',
        durationMin: 60,
        startDate: '2026-07-23',
        repeatCount: 3,
        type: 'INDIVIDUAL',
        notes: 'Регулярная серия',
      });

    expect(res.status).toBe(201);
    expect(res.body.series).toHaveProperty('id');
    expect(res.body.lessons).toHaveLength(3);
    expect(res.body.conflicts).toHaveLength(0);
  });

  it('POST /api/lessons отклоняет занятие с чужим клиентом', async () => {
    const otherClient = await testPrisma.client.create({
      data: {
        fullName: 'Other Client',
        email: 'other.client@example.com',
        userId: seed.otherTeacher.id,
      },
    });

    const res = await request(app)
      .post('/api/lessons')
      .set(authHeader(seed.teacher))
      .send({
        clientId: otherClient.id,
        startTime: '2026-07-17T12:00:00+03:00',
        durationMin: 60,
        type: 'INDIVIDUAL',
      });

    expect([403, 404]).toContain(res.status);
  });
});
