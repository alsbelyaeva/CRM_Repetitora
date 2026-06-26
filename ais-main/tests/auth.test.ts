import crypto from 'crypto';
import request from 'supertest';
import app from '../src/app';
import { resetDatabase, testPrisma } from './utils/dbReset';
import { seedTestData } from './utils/testSeed';
import { authHeader } from './utils/testAuth';
import { withoutEnv } from './utils/env';

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashEmailVerificationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('Auth API', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;

  beforeEach(async () => {
    await resetDatabase();
    seed = await seedTestData();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('POST /api/auth/register регистрирует преподавателя и игнорирует роль из тела', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'registered.teacher@mail.ru',
        password: 'Register123',
        fullName: 'Registered Teacher',
        role: 'ADMIN',
        acceptedTerms: true,
        acceptedPrivacyPolicy: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('TEACHER');
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.emailVerifiedAt).toBeNull();
    expect(res.body.user.acceptedTermsAt).toBeTruthy();
    expect(res.body.user.acceptedPrivacyPolicyAt).toBeTruthy();

    const user = await testPrisma.user.findUnique({
      where: { email: 'registered.teacher@mail.ru' },
    });
    expect(user?.acceptedTermsAt).toBeTruthy();
    expect(user?.acceptedPrivacyPolicyAt).toBeTruthy();
  });

  it('POST /api/auth/register отклоняет регистрацию с иностранным доменом email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'foreign.user@gmail.com',
        password: 'Register123',
        fullName: 'Foreign Email',
        acceptedTerms: true,
        acceptedPrivacyPolicy: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('российских доменах');

    const user = await testPrisma.user.findUnique({
      where: { email: 'foreign.user@gmail.com' },
    });
    expect(user).toBeNull();
  });

  it('POST /api/auth/register отклоняет регистрацию без обязательных согласий', async () => {
    const withoutTerms = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'no.terms@example.com',
        password: 'Register123',
        fullName: 'No Terms',
        acceptedPrivacyPolicy: true,
      });

    expect(withoutTerms.status).toBe(400);
    expect(withoutTerms.body.error).toMatch(/Пользовательское соглашение/);

    const withoutPrivacy = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'no.privacy@example.com',
        password: 'Register123',
        fullName: 'No Privacy',
        acceptedTerms: true,
      });

    expect(withoutPrivacy.status).toBe(400);
    expect(withoutPrivacy.body.error).toMatch(/обработку персональных данных/);
  });

  it('POST /api/auth/login авторизует тестового преподавателя', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: seed.teacher.email, password: seed.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(seed.teacher.email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('POST /api/auth/forgot-password точно сообщает, найден email и отправлено ли письмо', async () => {
    await withoutEnv(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'], async () => {
      const existing = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: seed.teacher.email });

      const missing = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'missing@example.com' });

      expect(existing.status).toBe(503);
      expect(existing.body.emailFound).toBe(true);
      expect(existing.body.emailSent).toBe(false);
      expect(existing.body.error).toMatch(/SMTP|Письмо не отправлено/);

      expect(missing.status).toBe(404);
      expect(missing.body.emailFound).toBe(false);
      expect(missing.body.emailSent).toBe(false);
      expect(missing.body.error).toMatch(/не найден/);
    });
  });

  it('POST /api/auth/email-verification/request создает токен подтверждения email', async () => {
    await withoutEnv(['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'], async () => {
      const res = await request(app)
        .post('/api/auth/email-verification/request')
        .set(authHeader(seed.teacher))
        .send();

      expect(res.status).toBe(503);
      expect(res.body.emailVerified).toBe(false);
      expect(res.body.emailSent).toBe(false);

      const token = await testPrisma.emailVerificationToken.findFirst({
        where: {
          userId: seed.teacher.id,
          email: seed.teacher.email,
          usedAt: null,
        },
      });

      expect(token).toBeTruthy();
      expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  it('POST /api/auth/email-verification/confirm подтверждает email и повторно сообщает об успешном подтверждении', async () => {
    const token = 'email-verification-token';
    await testPrisma.emailVerificationToken.create({
      data: {
        userId: seed.teacher.id,
        email: seed.teacher.email,
        tokenHash: hashEmailVerificationToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/auth/email-verification/confirm')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);

    const user = await testPrisma.user.findUnique({ where: { id: seed.teacher.id } });
    expect(user?.emailVerifiedAt).toBeTruthy();

    const secondUse = await request(app)
      .post('/api/auth/email-verification/confirm')
      .send({ token });

    expect(secondUse.status).toBe(200);
    expect(secondUse.body.emailVerified).toBe(true);
    expect(secondUse.body.message).toBe('Email уже подтверждён.');
  });

  it('POST /api/auth/reset-password меняет пароль по действующему токену и инвалидирует его', async () => {
    const token = 'reset-token';
    await testPrisma.passwordResetToken.create({
      data: {
        userId: seed.teacher.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token,
        newPassword: 'Changed123',
        confirmPassword: 'Changed123',
      });

    expect(res.status).toBe(200);

    const secondUse = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token,
        newPassword: 'ChangedAgain123',
        confirmPassword: 'ChangedAgain123',
      });

    expect(secondUse.status).toBe(400);
  });

  it('PATCH /api/auth/password меняет пароль авторизованного пользователя', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set(authHeader(seed.teacher))
      .send({
        currentPassword: seed.password,
        newPassword: 'TeacherChanged123',
        confirmPassword: 'TeacherChanged123',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Пароль успешно/);
  });
});
