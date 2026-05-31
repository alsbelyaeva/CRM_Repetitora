import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';

describe('Slot Requests API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/slot-requests создает запрос слотов', async () => {
    const res = await request(app)
      .post('/api/slot-requests')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        proposedSlots: [
          { from: '2026-06-14T10:00:00+03:00', to: '2026-06-14T11:00:00+03:00' },
          { from: '2026-06-14T12:00:00+03:00', to: '2026-06-14T13:00:00+03:00' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.proposedSlots).toHaveLength(2);
    expect(res.body.proposedSlots[0].status).toBe('PENDING');
  });

  it('DELETE /api/slot-requests/:id отменяет запрос, сохраняя запись', async () => {
    const res = await request(app)
      .delete(`/api/slot-requests/${seed.slotRequest.id}`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    const slotRequest = await testPrisma.slotRequest.findUnique({ where: { id: seed.slotRequest.id } });
    expect(slotRequest?.status).toBe('CANCELLED');
  });

  it('PATCH /api/slot-requests/:id/restore восстанавливает запрос', async () => {
    await testPrisma.slotRequest.update({
      where: { id: seed.slotRequest.id },
      data: {
        status: 'CANCELLED',
        proposedSlots: [{ from: '2026-06-11T12:00:00+03:00', to: '2026-06-11T13:00:00+03:00', status: 'CANCELLED' }],
      },
    });

    const res = await request(app)
      .patch(`/api/slot-requests/${seed.slotRequest.id}/restore`)
      .set(authHeader(seed.teacher));

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('PENDING');
    expect(res.body.request.proposedSlots[0].status).toBe('PENDING');
  });
});
