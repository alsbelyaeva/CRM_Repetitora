import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

function date(year: number, month: number, day: number, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function dateOnly(year: number, month: number, day: number) {
  return date(year, month, day);
}

function isoLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function rankedSlot(
  from: Date,
  durationMin: number,
  score: number,
  status = 'PENDING',
  explanation = 'Хороший слот по настройкам преподавателя',
) {
  const to = addMinutes(from, durationMin);
  const breakdown = {
    timeScore: 0.82,
    compactScore: 0.72,
    workingDayScore: 1,
    priorityScore: 0.55,
    travelScore: 0.8,
  };

  return {
    from: isoLocal(from),
    to: isoLocal(to),
    score,
    status,
    breakdown,
    weightedBreakdown: {
      timeScore: Math.round(score * 0.28 * 100) / 100,
      compactScore: Math.round(score * 0.2 * 100) / 100,
      workingDayScore: Math.round(score * 0.18 * 100) / 100,
      priorityScore: Math.round(score * 0.14 * 100) / 100,
      travelScore: Math.round(score * 0.2 * 100) / 100,
    },
    criterionReasons: {
      time: 'Удобное время дня и близкая дата',
      compact: 'Слот хорошо ложится рядом с существующим расписанием',
      workingDay: 'Выбран рабочий день преподавателя',
      priority: 'Приоритет клиента учтен',
      travel: 'Дорога укладывается в желаемый максимум',
    },
    travelScore: 0.8,
    travelTimeMinutes: 35,
    availableGapMinutes: 90,
    travelDetails: {
      score: 0.8,
      travelTimeMinutes: 35,
      availableGapMinutes: 90,
      desiredBreakMinutes: 30,
      maxTravelMinutes: 60,
      explanation: 'Дорога и запас времени комфортны для преподавателя',
    },
    explanation,
    hasConflict: false,
    lessonId: null,
    recurrence: null,
    recurringSeriesId: null,
  };
}

async function createLesson(input: {
  userId: string;
  clientId: number;
  participantClientIds?: number[];
  startTime: Date;
  durationMin: number;
  type: string;
  status?: 'PLANNED' | 'DONE' | 'CANCELLED';
  notes?: string;
  recurringSeriesId?: number;
}) {
  const participantIds = Array.from(new Set([
    input.clientId,
    ...(input.participantClientIds ?? []),
  ]));

  return prisma.lesson.create({
    data: {
      userId: input.userId,
      clientId: input.clientId,
      startTime: input.startTime,
      durationMin: input.durationMin,
      type: input.type,
      status: input.status ?? 'PLANNED',
      notes: input.notes,
      recurringSeriesId: input.recurringSeriesId,
      participants: {
        create: participantIds.map(clientId => ({ clientId })),
      },
    },
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@ais.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123';
  const teacherEmail = process.env.SEED_TEACHER_EMAIL || 'teacher@ais.local';
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD || 'Teacher123';

  console.log('🧹 Очистка базы данных...');

  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.telegramNotificationLog.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lessonParticipant.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.recurringSeries.deleteMany();
  await prisma.scheduleEvent.deleteMany();
  await prisma.slotRequest.deleteMany();
  await prisma.client.deleteMany();
  await prisma.slotWeight.deleteMany();
  await prisma.user.deleteMany();

  console.log('👤 Создание пользователей...');
  const verifiedAt = new Date();

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      fullName: 'Администратор системы',
      address: 'Москва, Тверская улица, 1',
      role: UserRole.ADMIN,
      emailVerifiedAt: verifiedAt,
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      email: teacherEmail,
      passwordHash: await hashPassword(teacherPassword),
      fullName: 'Анна Иванова',
      address: 'Москва, Лесная улица, 20',
      role: UserRole.TEACHER,
      emailVerifiedAt: verifiedAt,
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      email: 'teacher2@ais.local',
      passwordHash: await hashPassword('Tutor1234'),
      fullName: 'Сергей Петров',
      address: 'Москва, Большая Никитская улица, 22',
      role: UserRole.TEACHER,
      emailVerifiedAt: verifiedAt,
    },
  });

  await prisma.slotWeight.createMany({
    data: [
      {
        userId: teacher1.id,
        wTime: 0.35,
        wCompact: 0.25,
        wWorkingDay: 0.2,
        wPriority: 0.2,
        wTravel: 0.25,
        minGapMinutes: 60,
        desiredBreakMinutes: 30,
        maxGapMinutes: 180,
        maxTravelMinutes: 60,
        workingDays: [1, 2, 3, 4, 5],
        preferredTimes: {
          morning: { period: 'morning', enabled: true, weight: 0.6 },
          day: { period: 'day', enabled: true, weight: 0.9 },
          evening: { period: 'evening', enabled: true, weight: 0.7 },
        },
      },
      {
        userId: teacher2.id,
        wTime: 0.25,
        wCompact: 0.3,
        wWorkingDay: 0.2,
        wPriority: 0.15,
        wTravel: 0.25,
        minGapMinutes: 30,
        desiredBreakMinutes: 30,
        maxGapMinutes: 180,
        maxTravelMinutes: 45,
        workingDays: [1, 2, 3, 4, 5, 6],
        preferredTimes: {
          morning: { period: 'morning', enabled: true, weight: 0.4 },
          day: { period: 'day', enabled: true, weight: 0.8 },
          evening: { period: 'evening', enabled: true, weight: 0.9 },
        },
      },
    ],
  });

  console.log('👥 Создание клиентов...');

  const annaClients = await Promise.all([
    prisma.client.create({ data: { fullName: 'Алексей Смирнов', email: 'alexey@example.com', phone: '+79990000001', userId: teacher1.id, vip: false, address: 'Москва, Ленинградский проспект, 31А', notes: 'Готовится к ОГЭ, просит вечерние слоты.' } }),
    prisma.client.create({ data: { fullName: 'Мария Кузнецова', email: 'maria@example.com', phone: '+79990000002', userId: teacher1.id, vip: true, address: 'Москва, Тверская улица, 7', notes: 'VIP клиент, оплата пакетами.' } }),
    prisma.client.create({ data: { fullName: 'Илья Воронов', email: 'ilya@example.com', phone: '+79990000003', userId: teacher1.id, vip: false, address: 'Москва, улица Арбат, 12' } }),
    prisma.client.create({ data: { fullName: 'София Белова', email: 'sofia@example.com', phone: '+79990000006', userId: teacher1.id, vip: false, address: 'Москва, Садовая-Кудринская улица, 3' } }),
  ]);

  const sergeyClients = await Promise.all([
    prisma.client.create({ data: { fullName: 'Ольга Павлова', email: 'olga@example.com', phone: '+79990000004', userId: teacher2.id, vip: false, address: 'Москва, Новый Арбат, 21' } }),
    prisma.client.create({ data: { fullName: 'Никита Орлов', email: 'nikita@example.com', phone: '+79990000005', userId: teacher2.id, vip: true, address: 'Москва, Пресненская набережная, 12', notes: 'Нужны занятия два раза в неделю.' } }),
    prisma.client.create({ data: { fullName: 'Екатерина Морозова', email: 'ekaterina@example.com', phone: '+79990000007', userId: teacher2.id, vip: false, address: 'Москва, улица Покровка, 19' } }),
    prisma.client.create({ data: { fullName: 'Даниил Федоров', email: 'daniil@example.com', phone: '+79990000008', userId: teacher2.id, vip: false, address: 'Москва, Кутузовский проспект, 30' } }),
  ]);

  console.log('📅 Создание расписания за май и июнь...');

  const annaSeries = await prisma.recurringSeries.create({
    data: {
      userId: teacher1.id,
      clientId: annaClients[1].id,
      weekday: 2,
      startTime: '16:00',
      durationMin: 60,
      type: 'Индивидуальное',
      notes: 'Регулярная подготовка к экзамену',
      startsOn: dateOnly(2026, 5, 6),
      endsOn: dateOnly(2026, 6, 24),
      status: 'ACTIVE',
    },
  });

  const sergeySeries = await prisma.recurringSeries.create({
    data: {
      userId: teacher2.id,
      clientId: sergeyClients[1].id,
      weekday: 4,
      startTime: '18:00',
      durationMin: 90,
      type: 'Групповое',
      notes: 'Регулярная мини-группа',
      startsOn: dateOnly(2026, 5, 8),
      endsOn: dateOnly(2026, 6, 26),
      status: 'ACTIVE',
    },
  });

  const lessons = await Promise.all([
    createLesson({ userId: teacher1.id, clientId: annaClients[0].id, startTime: date(2026, 5, 5, 10), durationMin: 60, type: 'Индивидуальное', status: 'DONE', notes: 'Диагностика перед началом месяца' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[1].id, startTime: date(2026, 5, 7, 15), durationMin: 90, type: 'Групповое', status: 'DONE', participantClientIds: [annaClients[2].id], notes: 'Группа: разбор задач повышенной сложности' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[3].id, startTime: date(2026, 5, 12, 12), durationMin: 45, type: 'Пробное', status: 'DONE', notes: 'Пробное занятие, клиенту понравился формат' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[0].id, startTime: date(2026, 5, 19, 11), durationMin: 60, type: 'Индивидуальное', status: 'CANCELLED', notes: 'Отменено клиентом за день до занятия' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[1].id, startTime: date(2026, 5, 6, 16), durationMin: 60, type: 'Индивидуальное', status: 'DONE', recurringSeriesId: annaSeries.id, notes: 'Регулярное занятие' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[1].id, startTime: date(2026, 5, 13, 16), durationMin: 60, type: 'Индивидуальное', status: 'DONE', recurringSeriesId: annaSeries.id, notes: 'Регулярное занятие' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[1].id, startTime: date(2026, 6, 3, 16), durationMin: 60, type: 'Индивидуальное', status: 'DONE', recurringSeriesId: annaSeries.id, notes: 'Регулярное занятие' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[1].id, startTime: date(2026, 6, 10, 16), durationMin: 60, type: 'Индивидуальное', status: 'CANCELLED', recurringSeriesId: annaSeries.id, notes: 'Отменено из регулярной серии' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[2].id, startTime: date(2026, 6, 4, 14), durationMin: 60, type: 'Индивидуальное', status: 'DONE', notes: 'Повторение майской темы' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[0].id, startTime: date(2026, 6, 15, 18), durationMin: 90, type: 'Групповое', status: 'PLANNED', participantClientIds: [annaClients[2].id], notes: 'Плановая групповая отработка' }),
    createLesson({ userId: teacher1.id, clientId: annaClients[3].id, startTime: date(2026, 6, 18, 13), durationMin: 45, type: 'Пробное', status: 'PLANNED', notes: 'Пробное занятие для нового клиента' }),

    createLesson({ userId: teacher2.id, clientId: sergeyClients[0].id, startTime: date(2026, 5, 6, 11), durationMin: 60, type: 'Индивидуальное', status: 'DONE', notes: 'Первое занятие месяца' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[1].id, startTime: date(2026, 5, 8, 18), durationMin: 90, type: 'Групповое', status: 'DONE', participantClientIds: [sergeyClients[2].id], recurringSeriesId: sergeySeries.id, notes: 'Регулярная мини-группа' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[3].id, startTime: date(2026, 5, 14, 13), durationMin: 45, type: 'Пробное', status: 'DONE', notes: 'Пробное занятие' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[0].id, startTime: date(2026, 5, 21, 17), durationMin: 60, type: 'Индивидуальное', status: 'CANCELLED', notes: 'Отменено преподавателем' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[1].id, startTime: date(2026, 5, 15, 18), durationMin: 90, type: 'Групповое', status: 'DONE', participantClientIds: [sergeyClients[2].id], recurringSeriesId: sergeySeries.id, notes: 'Регулярная мини-группа' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[1].id, startTime: date(2026, 6, 5, 18), durationMin: 90, type: 'Групповое', status: 'DONE', participantClientIds: [sergeyClients[2].id], recurringSeriesId: sergeySeries.id, notes: 'Регулярная мини-группа' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[1].id, startTime: date(2026, 6, 12, 18), durationMin: 90, type: 'Групповое', status: 'PLANNED', participantClientIds: [sergeyClients[2].id], recurringSeriesId: sergeySeries.id, notes: 'Регулярная мини-группа' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[2].id, startTime: date(2026, 6, 2, 10), durationMin: 60, type: 'Индивидуальное', status: 'DONE', notes: 'Контрольная работа' }),
    createLesson({ userId: teacher2.id, clientId: sergeyClients[3].id, startTime: date(2026, 6, 17, 12), durationMin: 45, type: 'Пробное', status: 'PLANNED', notes: 'Пробное занятие в июне' }),
  ]);

  await prisma.scheduleEvent.createMany({
    data: [
      { userId: teacher1.id, title: 'Личное окно: методический семинар', startTime: date(2026, 5, 9, 13), durationMin: 120, type: 'PERSONAL', location: 'Онлайн', notes: 'Нельзя ставить занятия', status: 'ACTIVE' },
      { userId: teacher1.id, title: 'Поездка между районами', startTime: date(2026, 5, 23, 12), durationMin: 60, type: 'TRAVEL', location: 'Москва', notes: 'Заложено время дороги', status: 'ACTIVE' },
      { userId: teacher1.id, title: 'Личное событие отменено', startTime: date(2026, 6, 6, 10), durationMin: 90, type: 'PERSONAL', location: 'Москва', notes: 'Планы изменились', status: 'CANCELLED' },
      { userId: teacher1.id, title: 'Подготовка материалов', startTime: date(2026, 6, 20, 11), durationMin: 120, type: 'OTHER', location: 'Дом', notes: 'Рабочий блок без клиентов', status: 'ACTIVE' },
      { userId: teacher2.id, title: 'Личная встреча', startTime: date(2026, 5, 10, 15), durationMin: 90, type: 'PERSONAL', location: 'Москва, Чистые пруды', status: 'ACTIVE' },
      { userId: teacher2.id, title: 'Дорога на выездное занятие', startTime: date(2026, 5, 28, 16), durationMin: 75, type: 'TRAVEL', location: 'Москва', status: 'ACTIVE' },
      { userId: teacher2.id, title: 'Отмененная личная запись', startTime: date(2026, 6, 4, 9), durationMin: 60, type: 'PERSONAL', location: 'Москва', notes: 'Отменено', status: 'CANCELLED' },
      { userId: teacher2.id, title: 'Проверка домашних работ', startTime: date(2026, 6, 19, 14), durationMin: 120, type: 'OTHER', location: 'Дом', status: 'ACTIVE' },
    ],
  });

  console.log('💳 Создание платежей...');

  await prisma.payment.createMany({
    data: [
      { clientId: annaClients[0].id, lessonId: lessons[0].id, amount: 2500, method: 'Перевод', dateTime: date(2026, 5, 5, 11, 15), note: 'Оплата после индивидуального занятия' },
      { clientId: annaClients[1].id, lessonId: lessons[1].id, amount: 4200, method: 'Наличные', dateTime: date(2026, 5, 7, 16, 45), note: 'Групповое занятие, оплачено за двоих' },
      { clientId: annaClients[3].id, lessonId: lessons[2].id, amount: 1500, method: 'Перевод', dateTime: date(2026, 5, 12, 13), note: 'Пробное занятие' },
      { clientId: annaClients[1].id, lessonId: lessons[6].id, amount: 3000, method: 'Карта', dateTime: date(2026, 6, 3, 17, 10), note: 'Первый платеж июня по регулярной серии' },
      { clientId: annaClients[2].id, lessonId: lessons[8].id, amount: 2600, method: 'Перевод', dateTime: date(2026, 6, 4, 15, 20), note: 'Оплата за повторение темы' },
      { clientId: sergeyClients[0].id, lessonId: lessons[11].id, amount: 2800, method: 'Перевод', dateTime: date(2026, 5, 6, 12, 10), note: 'Майское индивидуальное занятие' },
      { clientId: sergeyClients[1].id, lessonId: lessons[12].id, amount: 5000, method: 'Карта', dateTime: date(2026, 5, 8, 19, 45), note: 'Оплата мини-группы' },
      { clientId: sergeyClients[3].id, lessonId: lessons[13].id, amount: 1500, method: 'Наличные', dateTime: date(2026, 5, 14, 14), note: 'Пробное занятие' },
      { clientId: sergeyClients[1].id, lessonId: lessons[16].id, amount: 5000, method: 'Карта', dateTime: date(2026, 6, 5, 19, 45), note: 'Первая неделя июня, регулярная группа' },
      { clientId: sergeyClients[2].id, lessonId: lessons[18].id, amount: 2800, method: 'Перевод', dateTime: date(2026, 6, 2, 11, 15), note: 'Контрольная работа и разбор ошибок' },
    ],
  });

  console.log('📥 Создание заявок на занятия...');

  const annaConfirmedLesson = await createLesson({
    userId: teacher1.id,
    clientId: annaClients[0].id,
    startTime: date(2026, 6, 24, 17),
    durationMin: 60,
    type: 'Индивидуальное',
    status: 'PLANNED',
    notes: 'Создано из подтвержденной заявки слота',
  });

  await prisma.slotRequest.createMany({
    data: [
      {
        clientId: annaClients[0].id,
        userId: teacher1.id,
        status: 'PENDING',
        proposedSlots: [
          rankedSlot(date(2026, 6, 16, 15), 60, 82.4, 'PENDING', 'Лучший слот: удобное время и комфортная дорога'),
          rankedSlot(date(2026, 6, 18, 11), 60, 68.7, 'PENDING', 'Подходит по рабочему дню, но менее компактен'),
          rankedSlot(date(2026, 6, 20, 18), 60, 54.2, 'PENDING', 'Вечерний слот, но день менее удобен'),
        ],
        createdAt: date(2026, 6, 11, 10),
      },
      {
        clientId: annaClients[1].id,
        userId: teacher1.id,
        status: 'CONFIRMED',
        proposedSlots: [
          { ...rankedSlot(date(2026, 6, 24, 17), 60, 88.1, 'CONFIRMED', 'Слот принят преподавателем'), lessonId: annaConfirmedLesson.id },
          rankedSlot(date(2026, 6, 25, 12), 60, 61.5, 'PENDING', 'Запасной вариант'),
        ],
        createdAt: date(2026, 6, 9, 14),
      },
      {
        clientId: annaClients[3].id,
        userId: teacher1.id,
        status: 'CANCELLED',
        proposedSlots: [
          rankedSlot(date(2026, 6, 13, 10), 45, 47.8, 'CANCELLED', 'Клиент отказался от предложенных вариантов'),
          rankedSlot(date(2026, 6, 14, 16), 45, 51.3, 'CANCELLED', 'Отклонено после уточнения расписания'),
        ],
        createdAt: date(2026, 6, 8, 9),
      },
      {
        clientId: sergeyClients[0].id,
        userId: teacher2.id,
        status: 'PENDING',
        proposedSlots: [
          rankedSlot(date(2026, 6, 17, 12), 60, 76.9, 'PENDING', 'Удобный дневной слот'),
          rankedSlot(date(2026, 6, 19, 18), 60, 63.4, 'PENDING', 'Вечер удобен, но дорога длиннее'),
        ],
        createdAt: date(2026, 6, 11, 11),
      },
      {
        clientId: sergeyClients[1].id,
        userId: teacher2.id,
        status: 'CANCELLED',
        proposedSlots: [
          rankedSlot(date(2026, 6, 18, 18), 90, 58.6, 'CANCELLED', 'Отклонено: конфликт с регулярной группой'),
        ],
        createdAt: date(2026, 6, 7, 16),
      },
    ],
  });

  console.log('🧾 Создание журнала действий...');

  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, action: 'user.update', entity: 'User', entityId: teacher1.id, details: { changedFields: ['address'], note: 'Администратор уточнил адрес преподавателя' }, createdAt: date(2026, 5, 2, 9, 30) },
      { userId: teacher1.id, action: 'client.create', entity: 'Client', entityId: String(annaClients[0].id), details: { clientName: annaClients[0].fullName }, createdAt: date(2026, 5, 3, 12, 10) },
      { userId: teacher1.id, action: 'lesson.create', entity: 'Lesson', entityId: String(lessons[1].id), details: { type: 'Групповое', participantNames: ['Мария Кузнецова', 'Илья Воронов'] }, createdAt: date(2026, 5, 7, 15, 5) },
      { userId: teacher1.id, action: 'payment.create', entity: 'Payment', entityId: '2', details: { clientName: annaClients[1].fullName, amount: 4200, method: 'Наличные' }, createdAt: date(2026, 5, 7, 16, 50) },
      { userId: teacher2.id, action: 'lesson.status.update', entity: 'Lesson', entityId: String(lessons[14].id), details: { oldStatus: 'PLANNED', newStatus: 'CANCELLED', reason: 'Отмена преподавателем' }, createdAt: date(2026, 5, 20, 18) },
      { userId: teacher2.id, action: 'slotRequest.create', entity: 'SlotRequest', entityId: '4', details: { clientName: sergeyClients[0].fullName, slotsCount: 2 }, createdAt: date(2026, 6, 11, 11, 10) },
      { userId: admin.id, action: 'audit.view', entity: 'AuditLog', entityId: null, details: { filter: 'all users' }, createdAt: date(2026, 6, 11, 12) },
    ],
  });

  console.log('✅ Сиды успешно загружены');
  console.log(`Демо-вход администратора: ${adminEmail} / ${adminPassword}`);
  console.log(`Демо-вход преподавателя: ${teacherEmail} / ${teacherPassword}`);
}

main()
  .catch((e) => {
    console.error('❌ Ошибка сидирования:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
