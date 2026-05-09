import request from 'supertest';
import { resetDatabase, testPrisma, getTestDatabaseUrl, assertSafeTestDatabaseUrl } from '../utils/dbReset';
import { seedTestData } from '../utils/testSeed';
import { authHeader } from '../utils/testAuth';

type ScenarioName = 'get_schedule' | 'get_clients' | 'rank_slots' | 'create_slot_request';

type Sample = {
  scenario: ScenarioName;
  durationMs: number;
  ok: boolean;
  status?: number;
  error?: string;
};

const scenarioLabels: Record<ScenarioName, string> = {
  get_schedule: 'Получение расписания',
  get_clients: 'Получение клиентов',
  rank_slots: 'Ранжирование слотов',
  create_slot_request: 'Создание запроса слотов',
};

function getLoadConfig() {
  const virtualUsers = Number(process.env.LOAD_TEST_USERS || 30);
  const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS || 60);

  if (!Number.isInteger(virtualUsers) || virtualUsers < 20 || virtualUsers > 50) {
    throw new Error('LOAD_TEST_USERS должен быть целым числом от 20 до 50.');
  }

  if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 180) {
    throw new Error('LOAD_TEST_DURATION_SECONDS должен быть целым числом от 60 до 180.');
  }

  return { virtualUsers, durationSeconds };
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function summarize(samples: Sample[]) {
  const scenarios = Object.keys(scenarioLabels) as ScenarioName[];
  return scenarios.map((scenario) => {
    const scenarioSamples = samples.filter(sample => sample.scenario === scenario);
    const durations = scenarioSamples.map(sample => sample.durationMs);
    const errors = scenarioSamples.filter(sample => !sample.ok).length;

    return {
      scenario,
      label: scenarioLabels[scenario],
      requests: scenarioSamples.length,
      avgMs: durations.length > 0 ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
      maxMs: durations.length > 0 ? Math.max(...durations) : 0,
      p95Ms: round(percentile(durations, 95)),
      errors,
      errorRate: scenarioSamples.length > 0 ? round((errors / scenarioSamples.length) * 100) : 0,
    };
  });
}

async function main() {
  const testDatabaseUrl = getTestDatabaseUrl();
  assertSafeTestDatabaseUrl(testDatabaseUrl);

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.TWO_GIS_API_KEY = '';
  process.env.SMTP_HOST = '';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASSWORD = '';

  const { default: app } = await import('../../src/app');
  const { virtualUsers, durationSeconds } = getLoadConfig();

  await resetDatabase();
  const seed = await seedTestData();
  const auth = authHeader(seed.teacher);
  const scenarios = Object.keys(scenarioLabels) as ScenarioName[];
  const samples: Sample[] = [];
  const deadline = Date.now() + durationSeconds * 1000;

  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (process.env.LOAD_TEST_VERBOSE === 'true') originalLog(...args);
  };

  async function runScenario(scenario: ScenarioName, sequence: number) {
    const started = Date.now();
    try {
      let response: request.Response;
      const day = 20 + (sequence % 8);
      const hour = 9 + (sequence % 8);
      const from = `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+03:00`;
      const to = `2026-05-${String(day).padStart(2, '0')}T${String(hour + 1).padStart(2, '0')}:00:00+03:00`;

      if (scenario === 'get_schedule') {
        response = await request(app).get('/api/lessons').set(auth);
      } else if (scenario === 'get_clients') {
        response = await request(app).get('/api/clients').set(auth);
      } else if (scenario === 'rank_slots') {
        response = await request(app)
          .post('/api/slots/rank')
          .set(auth)
          .send({
            clientId: seed.client.id,
            proposedSlots: [
              { from, to },
              { from: '2026-05-11T10:00:00+03:00', to: '2026-05-11T11:00:00+03:00' },
              { from: `2026-05-${String(day).padStart(2, '0')}T18:00:00+03:00`, to: `2026-05-${String(day).padStart(2, '0')}T19:00:00+03:00` },
            ],
          });
      } else {
        response = await request(app)
          .post('/api/slot-requests')
          .set(auth)
          .send({
            clientId: sequence % 2 === 0 ? seed.client.id : seed.secondClient.id,
            proposedSlots: [{ from, to, status: 'PENDING' }],
          });
      }

      const durationMs = Date.now() - started;
      samples.push({
        scenario,
        durationMs,
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
      });
    } catch (error: any) {
      samples.push({
        scenario,
        durationMs: Date.now() - started,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  async function virtualUser(userIndex: number) {
    let iteration = 0;
    while (Date.now() < deadline) {
      const scenario = scenarios[(userIndex + iteration) % scenarios.length];
      await runScenario(scenario, userIndex * 100000 + iteration);
      iteration += 1;
    }
  }

  await Promise.all(Array.from({ length: virtualUsers }, (_, index) => virtualUser(index)));
  console.log = originalLog;

  const summary = summarize(samples);
  const totalRequests = samples.length;
  const totalErrors = samples.filter(sample => !sample.ok).length;

  console.log(`Load test completed: users=${virtualUsers}, duration=${durationSeconds}s, requests=${totalRequests}, errors=${totalErrors}`);
  console.table(summary.map(item => ({
    scenario: item.label,
    requests: item.requests,
    avgMs: item.avgMs,
    maxMs: item.maxMs,
    p95Ms: item.p95Ms,
    errorRate: `${item.errorRate}%`,
  })));

  await testPrisma.$disconnect();

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await testPrisma.$disconnect();
  process.exit(1);
});
