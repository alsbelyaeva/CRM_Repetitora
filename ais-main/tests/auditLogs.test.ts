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

  it('POST /api/audit-logs создает запись от имени авторизованного пользователя', async () => {
    const res = await request(app)
      .post('/api/audit-logs')
      .set(authHeader(seed.teacher))
      .send({
        action: 'create',
        entity: 'Client',
        entityId: String(seed.client.id),
        details: { note: 'Создан тестовый клиент' },
      });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(seed.teacher.id);
    expect(res.body.action).toBe('create');
  });

  it('GET /api/audit-logs возвращает журналы администратору', async () => {
    await testPrisma.auditLog.create({
      data: {
        userId: seed.teacher.id,
        action: 'update',
        entity: 'Lesson',
        entityId: String(seed.lesson.id),
        details: { status: 'PLANNED' },
      },
    });

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(seed.admin));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
