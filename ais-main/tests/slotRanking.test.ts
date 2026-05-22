import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';
import { withoutEnv } from './utils/env';

describe('Smart Slotting API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/slots/rank ранжирует слоты и штрафует конфликт с занятием', async () => {
    await withoutEnv(['TWO_GIS_API_KEY'], async () => {
      const res = await request(app)
        .post('/api/slots/rank')
        .set(authHeader(seed.teacher))
        .send({
          clientId: seed.client.id,
          proposedSlots: [
            { from: '2026-06-11T12:00:00+03:00', to: '2026-06-11T13:00:00+03:00' },
            { from: '2026-06-11T10:30:00+03:00', to: '2026-06-11T11:30:00+03:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.rankedSlots).toHaveLength(2);
      expect(res.body.rankedSlots[0].hasConflict).toBe(false);
      expect(res.body.rankedSlots[1].hasConflict).toBe(true);
      expect(res.body.rankedSlots[0].score).toBeGreaterThan(res.body.rankedSlots[1].score);
    });
  });

  it('POST /api/slots/rank учитывает личное событие как занятость', async () => {
    await withoutEnv(['TWO_GIS_API_KEY'], async () => {
      const res = await request(app)
        .post('/api/slots/rank')
        .set(authHeader(seed.teacher))
        .send({
          clientId: seed.client.id,
          proposedSlots: [
            { from: '2026-06-12T18:15:00+03:00', to: '2026-06-12T19:15:00+03:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.rankedSlots[0].hasConflict).toBe(true);
      expect(res.body.rankedSlots[0].conflictingLesson.kind).toBe('event');
    });
  });

  it('POST /api/slots/rank использует безопасные веса по умолчанию, если сохраненная сумма весов равна нулю', async () => {
    await testPrisma.slotWeight.update({
      where: { userId: seed.teacher.id },
      data: {
        wTime: 0,
        wCompact: 0,
        wWorkingDay: 0,
        wPriority: 0,
        wTravel: 0,
      },
    });

    await withoutEnv(['TWO_GIS_API_KEY'], async () => {
      const res = await request(app)
        .post('/api/slots/rank')
        .set(authHeader(seed.teacher))
        .send({
          clientId: seed.client.id,
          proposedSlots: [
            { from: '2026-06-11T12:00:00+03:00', to: '2026-06-11T13:00:00+03:00' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.rankedSlots[0].score).toBeGreaterThan(0);

      const weightedBreakdown = res.body.rankedSlots[0].weightedBreakdown;
      expect(
        Object.values(weightedBreakdown).some((value) => Number(value) > 0)
      ).toBe(true);
    });
  });

  it('POST /api/slots/select отклоняет выбор слота поверх личного события', async () => {
    const res = await request(app)
      .post('/api/slots/select')
      .set(authHeader(seed.teacher))
      .send({
        clientId: seed.client.id,
        selectedSlot: {
          from: '2026-06-12T18:15:00+03:00',
          to: '2026-06-12T19:15:00+03:00',
        },
        durationMin: 60,
        type: 'INDIVIDUAL',
      });

    expect(res.status).toBe(409);
    expect(res.body.canReplace).toBe(false);
  });
});
