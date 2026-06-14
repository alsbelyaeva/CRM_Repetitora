import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Audit Logs API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function createManualLog(userId: string, action = 'manual.test') {
    return testPrisma.auditLog.create({
      data: {
        userId,
        action,
        entity: 'TestEntity',
        entityId: userId,
        details: { source: 'test' },
      },
    });
  }

  it('администратор видит все записи журнала', async () => {
    await createManualLog(seed.teacher.id, 'teacher.action');
    await createManualLog(seed.otherTeacher.id, 'other.action');

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(seed.admin));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((item: any) => item.userId).sort()).toEqual([
      seed.otherTeacher.id,
      seed.teacher.id,
    ].sort());
  });

  it('администратор фильтрует журнал по userId', async () => {
    await createManualLog(seed.teacher.id, 'teacher.action');
    await createManualLog(seed.otherTeacher.id, 'other.action');

    const res = await request(app)
      .get(`/api/audit-logs?userId=${seed.teacher.id}`)
      .set(authHeader(seed.admin));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId).toBe(seed.teacher.id);
  });

  it('преподаватель видит только свои записи', async () => {
    await createManualLog(seed.teacher.id, 'teacher.action');
    await createManualLog(seed.otherTeacher.id, 'other.action');

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId).toBe(seed.teacher.id);
  });

  it('преподаватель не может получить чужие записи через фильтр userId', async () => {
    await createManualLog(seed.teacher.id, 'teacher.action');
    await createManualLog(seed.otherTeacher.id, 'other.action');

    const res = await request(app)
      .get(`/api/audit-logs?userId=${seed.otherTeacher.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId).toBe(seed.teacher.id);
  });

  it('обычный пользователь не может создавать произвольные записи журнала', async () => {
    const res = await request(app)
      .post('/api/audit-logs')
      .set(authHeader(seed.teacher))
      .send({
        action: 'manual.create',
        entity: 'Client',
      });

    expect(res.status).toBe(403);
  });

  it('после создания клиента появляется запись AuditLog', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(authHeader(seed.teacher))
      .send({
        fullName: 'Audit Client',
        email: 'audit.client@example.com',
        phone: '+79990000077',
      });

    expect(res.status).toBe(201);

    const log = await testPrisma.auditLog.findFirst({
      where: {
        userId: seed.teacher.id,
        action: 'client.create',
        entity: 'Client',
        entityId: String(res.body.id),
      },
    });

    expect(log).not.toBeNull();
  });

  it('после создания занятия появляется запись AuditLog', async () => {
    const res = await request(app)
      .post('/api/lessons')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        startTime: '2026-05-22T10:00:00+03:00',
        durationMin: 60,
        type: 'INDIVIDUAL',
      });

    expect(res.status).toBe(201);

    const log = await testPrisma.auditLog.findFirst({
      where: {
        userId: seed.teacher.id,
        action: 'lesson.create',
        entity: 'Lesson',
        entityId: String(res.body.id),
      },
    });

    expect(log).not.toBeNull();
  });

  it('после создания платежа появляется запись AuditLog', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        lessonId: seed.lesson.id,
        amount: 1200,
        method: 'Наличные',
        dateTime: '2026-06-11T11:30:00+03:00',
      });

    expect(res.status).toBe(201);

    const log = await testPrisma.auditLog.findFirst({
      where: {
        userId: seed.teacher.id,
        action: 'payment.create',
        entity: 'Payment',
        entityId: String(res.body.id),
      },
    });

    expect(log).not.toBeNull();
  });

  it('после создания запроса слотов появляется запись AuditLog', async () => {
    const res = await request(app)
      .post('/api/slot-requests')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        proposedSlots: [
          {
            from: '2026-06-22T12:00:00+03:00',
            to: '2026-06-22T13:00:00+03:00',
          },
        ],
      });

    expect(res.status).toBe(201);

    const log = await testPrisma.auditLog.findFirst({
      where: {
        userId: seed.teacher.id,
        action: 'slotRequest.create',
        entity: 'SlotRequest',
        entityId: String(res.body.id),
      },
    });

    expect(log).not.toBeNull();
  });
});
