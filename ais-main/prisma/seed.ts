import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('🧹 Очистка базы данных...');

  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.slotRequest.deleteMany();
  await prisma.client.deleteMany();
  await prisma.slotWeight.deleteMany();
  await prisma.user.deleteMany();

  console.log('👤 Создание пользователей...');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@ais.local',
      passwordHash: await hashPassword('Admin123'),
      fullName: 'Администратор системы',
      address: 'Москва, Тверская улица, 1',
      role: UserRole.ADMIN,
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      email: 'teacher1@ais.local',
      passwordHash: await hashPassword('Teacher123'),
      fullName: 'Анна Иванова',
      address: 'Москва, Лесная улица, 20',
      role: UserRole.TEACHER,
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      email: 'teacher2@ais.local',
      passwordHash: await hashPassword('Tutor1234'),
      fullName: 'Сергей Петров',
      address: 'Москва, Большая Никитская улица, 22',
      role: UserRole.TEACHER,
    },
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
}

main()
  .catch((e) => {
    console.error('❌ Ошибка сидирования:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
