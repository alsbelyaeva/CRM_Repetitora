import assert from 'assert/strict';
import { rankSlots, LessonForRanking, RankingConfig } from '../../src/services/slotRanking';
import { getPublicTransportTravelTime } from '../../src/services/twoGisTravelService';
import { TelegramNotificationService } from '../../src/services/TelegramNotificationService';
import { sendPasswordResetEmail } from '../../src/services/mailService';
import { getPasswordPolicyError } from '../../src/utils/passwordPolicy';

type TestGroup = 'normal' | 'extreme' | 'exception';

interface QualityTestResult {
  id: string;
  group: TestGroup;
  name: string;
  status: 'passed' | 'failed';
  details: string;
}

interface QualityTestCase {
  id: string;
  group: TestGroup;
  name: string;
  run: () => Promise<string> | string;
}

const baseConfig: RankingConfig = {
  weights: {
    wTime: 0.25,
    wCompact: 0.25,
    wWorkingDay: 0.2,
    wPriority: 0.15,
    wTravel: 0.15,
  },
  workingDays: [1, 2, 3, 4, 5],
  minGapMinutes: 30,
  maxGapMinutes: 180,
  desiredBreakMinutes: 30,
  slotAddress: 'Уфа, улица Ленина, 1',
  userAddress: 'Уфа, проспект Октября, 10',
};

const plannedLesson: LessonForRanking = {
  id: 101,
  kind: 'lesson',
  startTime: new Date('2026-05-11T10:00:00+03:00'),
  durationMin: 60,
  client: {
    fullName: 'Егор',
    address: 'Уфа, улица Пушкина, 5',
  },
};

const personalEvent: LessonForRanking = {
  id: 201,
  kind: 'event',
  title: 'Личное событие',
  startTime: new Date('2026-05-12T18:00:00+03:00'),
  durationMin: 60,
  location: 'Уфа, улица Комсомольская, 15',
};

async function withoutEnv<T>(names: string[], callback: () => Promise<T>): Promise<T> {
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];

  try {
    return await callback();
  } finally {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const tests: QualityTestCase[] = [
  {
    id: 'N-01',
    group: 'normal',
    name: 'Smart Slotting сортирует доступные слоты выше конфликтующих',
    run: async () => {
      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => rankSlots([
        {
          from: '2026-05-11T12:00:00+03:00',
          to: '2026-05-11T13:00:00+03:00',
        },
        {
          from: '2026-05-11T10:30:00+03:00',
          to: '2026-05-11T11:30:00+03:00',
        },
      ], [plannedLesson], baseConfig, false));

      assert.equal(result.length, 2);
      assert.equal(result[0].hasConflict, false);
      assert.equal(result[1].hasConflict, true);
      assert.ok(result[0].score > result[1].score);
      return `лучший слот: ${result[0].from}, конфликтный слот оштрафован до ${result[1].score}`;
    },
  },
  {
    id: 'N-02',
    group: 'normal',
    name: 'Учет личного события расписания как занятости преподавателя',
    run: async () => {
      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => rankSlots([
        {
          from: '2026-05-12T18:15:00+03:00',
          to: '2026-05-12T19:15:00+03:00',
        },
      ], [personalEvent], baseConfig, false));

      assert.equal(result[0].hasConflict, true);
      assert.equal(result[0].conflictingLesson?.kind, 'event');
      assert.match(result[0].explanation, /событием/i);
      return `слот пересекается с событием "${personalEvent.title}" и помечен конфликтным`;
    },
  },
  {
    id: 'N-03',
    group: 'normal',
    name: 'Политика пароля пропускает надежный пароль',
    run: () => {
      const error = getPasswordPolicyError('StrongPass123');
      assert.equal(error, null);
      return 'StrongPass123 принят политикой сложности';
    },
  },
  {
    id: 'E-01',
    group: 'extreme',
    name: 'Очень большой набор слотов ранжируется без падения',
    run: async () => {
      const slots = Array.from({ length: 150 }, (_, index) => {
        const start = new Date('2026-06-01T08:00:00+03:00');
        start.setMinutes(start.getMinutes() + index * 45);
        const end = new Date(start.getTime() + 45 * 60 * 1000);
        return {
          from: start.toISOString(),
          to: end.toISOString(),
        };
      });

      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => rankSlots(slots, [plannedLesson], baseConfig, true));
      assert.equal(result.length, slots.length);
      assert.ok(result.every((slot) => Number.isFinite(slot.score)));
      return `обработано слотов: ${result.length}`;
    },
  },
  {
    id: 'E-02',
    group: 'extreme',
    name: 'Регулярная серия описывается через recurringSeriesId и не ломает ранжирование',
    run: async () => {
      const recurringLesson: LessonForRanking = {
        ...plannedLesson,
        id: 301,
        startTime: new Date('2026-05-18T10:00:00+03:00'),
      };

      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => rankSlots([
        {
          from: '2026-05-18T10:30:00+03:00',
          to: '2026-05-18T11:30:00+03:00',
        },
      ], [recurringLesson], baseConfig, false));

      assert.equal(result[0].hasConflict, true);
      return 'экземпляр регулярного занятия учитывается как обычная занятость';
    },
  },
  {
    id: 'X-01',
    group: 'exception',
    name: '2GIS без TWO_GIS_API_KEY не вызывает падения и возвращает fallback',
    run: async () => {
      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => getPublicTransportTravelTime(
        'Уфа, Ленина, 1',
        'Уфа, Пушкина, 5',
        new Date('2026-05-11T09:00:00+03:00')
      ));

      assert.equal(result.status, 'missing_api_key');
      assert.equal(result.travelTimeMinutes, null);
      return 'маршрут пропущен со статусом missing_api_key';
    },
  },
  {
    id: 'X-02',
    group: 'exception',
    name: 'travelScore использует 0.3 при недоступном маршруте',
    run: async () => {
      const result = await withoutEnv(['TWO_GIS_API_KEY'], () => rankSlots([
        {
          from: '2026-05-11T12:00:00+03:00',
          to: '2026-05-11T13:00:00+03:00',
        },
      ], [plannedLesson], baseConfig, false));

      assert.equal(result[0].travelScore, 0.3);
      assert.ok(result[0].weightedBreakdown.travelScore > 0);
      return `fallback travelScore=${result[0].travelScore}, вклад=${result[0].weightedBreakdown.travelScore}`;
    },
  },
  {
    id: 'X-03',
    group: 'exception',
    name: 'Telegram без TELEGRAM_BOT_TOKEN пропускает отправку без падения',
    run: async () => {
      const service = new TelegramNotificationService(undefined);
      const result = await service.sendLessonReminder({
        chatId: '123',
        recipientLabel: 'Преподаватель',
        clientName: 'Егор',
        clientAddress: 'Уфа, Ленина, 1',
        startTime: new Date('2026-05-11T10:00:00+03:00'),
        durationMin: 60,
      });

      assert.equal(result.skipped, true);
      assert.equal(result.success, false);
      return 'отправка пропущена, исключение не выброшено';
    },
  },
  {
    id: 'X-04',
    group: 'exception',
    name: 'SMTP без настроек не ломает восстановление пароля',
    run: async () => {
      await withoutEnv(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'], async () => {
        const result = await sendPasswordResetEmail('student@example.com', 'http://localhost:5173/reset-password?token=test');
        if (result.success || result.reason !== 'smtp_not_configured') {
          throw new Error('Ожидался контролируемый пропуск SMTP без настроек');
        }
      });
      return 'sendPasswordResetEmail завершился без исключения и вернул smtp_not_configured';
    },
  },
  {
    id: 'X-05',
    group: 'exception',
    name: 'Слабый пароль получает понятное объяснение',
    run: () => {
      const error = getPasswordPolicyError('qwertyui');
      assert.ok(error);
      assert.match(error, /цифру/);
      assert.match(error, /заглавную/);
      assert.match(error, /простых шаблонов/);
      return 'для qwertyui возвращены причины усиления пароля';
    },
  },
];

async function run() {
  const results: QualityTestResult[] = [];

  for (const testCase of tests) {
    try {
      const details = await testCase.run();
      results.push({
        id: testCase.id,
        group: testCase.group,
        name: testCase.name,
        status: 'passed',
        details,
      });
    } catch (error: any) {
      results.push({
        id: testCase.id,
        group: testCase.group,
        name: testCase.name,
        status: 'failed',
        details: error?.message || String(error),
      });
    }
  }

  console.table(results.map((result) => ({
    id: result.id,
    group: result.group,
    status: result.status,
    name: result.name,
  })));

  for (const result of results) {
    console.log(`${result.id} ${result.status === 'passed' ? 'PASSED' : 'FAILED'}: ${result.details}`);
  }

  const failed = results.filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('Quality test runner failed:', error);
  process.exitCode = 1;
});
