import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
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

  // --- Даты для занятий ---
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // --- Создание клиентов ---
  console.log('👥 Создание клиентов...');

  const clientsTeacher1 = await prisma.client.createMany({
    data: [
      { fullName: 'Алексей Смирнов', email: 'alexey@example.com', phone: '+79990000001', userId: teacher1.id, vip: false, address: 'Москва, Ленинградский проспект, 31А' },
      { fullName: 'Мария Кузнецова', email: 'maria@example.com', phone: '+79990000002', userId: teacher1.id, vip: true, address: 'Москва, Тверская улица, 7' },
      { fullName: 'Илья Воронов', email: 'ilya@example.com', phone: '+79990000003', userId: teacher1.id, vip: false, address: 'Москва, улица Арбат, 12' },
    ],
  });

  const clientsTeacher2 = await prisma.client.createMany({
    data: [
      { fullName: 'Ольга Павлова', email: 'olga@example.com', phone: '+79990000004', userId: teacher2.id, vip: false, address: 'Москва, Новый Арбат, 21' },
      { fullName: 'Никита Орлов', email: 'nikita@example.com', phone: '+79990000005', userId: teacher2.id, vip: true, address: 'Москва, Пресненская набережная, 12' },
    ],
  });

  // Получаем полный список клиентов с их ID
  const clients = await prisma.client.findMany();

  // --- Создание SlotRequest ---
  console.log('📥 Создание заявок на занятия (SlotRequest)...');

  await prisma.slotRequest.create({
    data: {
      clientId: clients[0].id,
      userId: teacher1.id,
      proposedSlots: [
        { start: new Date(tomorrow.getTime() + 10 * 60 * 60 * 1000), duration: 60 },
        { start: new Date(tomorrow.getTime() + 2 * 24 * 60 * 60 * 1000), duration: 60 },
      ],
      status: 'pending',
    },
  });

  await prisma.slotRequest.create({
    data: {
      clientId: clients[3].id,
      userId: teacher2.id,
      proposedSlots: [
        { start: new Date(tomorrow.getTime() + 14 * 60 * 60 * 1000), duration: 90 },
      ],
      status: 'approved',
    },
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
