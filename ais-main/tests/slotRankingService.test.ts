import { rankSlots, RankingConfig } from '../src/services/slotRanking';
import { getPublicTransportTravelTime } from '../src/services/twoGisTravelService';

jest.mock('../src/services/twoGisTravelService', () => ({
  getPublicTransportTravelTime: jest.fn(),
}));

const mockedTravelTime = getPublicTransportTravelTime as jest.MockedFunction<typeof getPublicTransportTravelTime>;

const travelOnlyConfig: RankingConfig = {
  weights: {
    wTime: 0,
    wCompact: 0,
    wWorkingDay: 0,
    wPriority: 0,
    wTravel: 1,
  },
  workingDays: [1, 2, 3, 4, 5],
  preferredTimes: {},
  minGapMinutes: 30,
  maxGapMinutes: 180,
  desiredBreakMinutes: 0,
  maxTravelMinutes: 60,
  slotAddress: 'Уфа, улица Пушкина, 5',
  userAddress: 'Уфа, проспект Октября, 10',
};

describe('slotRanking service', () => {
  beforeEach(() => {
    mockedTravelTime.mockReset();
  });

  it('снижает балл дороги, если поездка дольше желаемого максимума', async () => {
    mockedTravelTime.mockResolvedValue({
      travelTimeMinutes: 120,
      status: 'ok',
    });

    const [slot] = await rankSlots(
      [{ from: '2026-06-11T12:00:00+03:00', to: '2026-06-11T13:00:00+03:00' }],
      [],
      travelOnlyConfig,
      false
    );

    expect(slot.score).toBeLessThan(50);
    expect(slot.travelScore).toBeLessThan(0.5);
    expect(slot.travelDetails.explanation).toContain('желаемый максимум 60 мин');
  });

  it('не штрафует дорогу, если максимум отключен', async () => {
    mockedTravelTime.mockResolvedValue({
      travelTimeMinutes: 120,
      status: 'ok',
    });

    const [slot] = await rankSlots(
      [{ from: '2026-06-11T12:00:00+03:00', to: '2026-06-11T13:00:00+03:00' }],
      [],
      {
        ...travelOnlyConfig,
        maxTravelMinutes: 0,
      },
      false
    );

    expect(slot.score).toBe(100);
    expect(slot.travelScore).toBe(1);
  });
});
