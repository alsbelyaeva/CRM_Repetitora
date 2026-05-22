import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Users API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('GET /api/users возвращает список только администратору', async () => {
    const teacherRes = await request(app)
      .get('/api/users')
      .set(authHeader(seed.teacher));
    expect(teacherRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/api/users')
      .set(authHeader(seed.admin));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/users создает пользователя администратором', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader(seed.admin))
      .send({
        email: 'created.teacher@example.com',
        password: 'Created123',
        fullName: 'Created Teacher',
        role: 'TEACHER',
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('created.teacher@example.com');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('POST /api/users отклоняет слабый пароль', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(authHeader(seed.admin))
      .send({
        email: 'weak.teacher@example.com',
        password: 'qwertyui',
        fullName: 'Weak Teacher',
        role: 'TEACHER',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/цифру|заглавную|простых шаблонов/i);
  });

  it('PUT /api/users/:id не дает администратору забрать права у самого себя', async () => {
    const res = await request(app)
      .put(`/api/users/${seed.admin.id}`)
      .set(authHeader(seed.admin))
      .send({ role: 'TEACHER' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('собственную роль');

    const admin = await testPrisma.user.findUnique({
      where: { id: seed.admin.id },
      select: { role: true },
    });
    expect(admin?.role).toBe('ADMIN');
  });

  it('GET /api/users учитывает актуальную роль из базы, а не роль в старом токене', async () => {
    await testPrisma.user.update({
      where: { id: seed.admin.id },
      data: { role: 'TEACHER' },
    });

    const res = await request(app)
      .get('/api/users')
      .set(authHeader(seed.admin));

    expect(res.status).toBe(403);
  });
});
