import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Clients API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('GET /api/clients возвращает клиентов текущего преподавателя', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((client: any) => client.userId === seed.teacher.id)).toBe(true);
  });

  it('POST /api/clients создает клиента преподавателя', async () => {
    const res = await request(app)
      .post('/api/clients')
      .set(authHeader(seed.teacher))
      .send({
        fullName: 'New Client',
        email: 'new.client@example.com',
        phone: '+79990000003',
        address: 'Уфа, улица Мира, 7',
        vip: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe('New Client');
    expect(res.body.userId).toBe(seed.teacher.id);
  });

  it('PUT /api/clients/:id обновляет клиента', async () => {
    const res = await request(app)
      .put(`/api/clients/${seed.client.id}`)
      .set(authHeader(seed.teacher))
      .send({ fullName: 'Updated Client', vip: false });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Updated Client');
    expect(res.body.vip).toBe(false);
  });

  it('DELETE /api/clients/:id выполняет soft delete', async () => {
    const res = await request(app)
      .delete(`/api/clients/${seed.secondClient.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    const deleted = await testPrisma.client.findUnique({ where: { id: seed.secondClient.id } });
    expect(deleted?.deletedAt).toBeTruthy();
  });

  it('DELETE /api/clients/:id запрещает удаление клиента с будущим запланированным занятием', async () => {
    const res = await request(app)
      .delete(`/api/clients/${seed.client.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('запланированные занятия');

    const client = await testPrisma.client.findUnique({ where: { id: seed.client.id } });
    expect(client?.deletedAt).toBeNull();
  });
});
