import bcrypt from 'bcrypt';
import { testPrisma } from './dbReset';

export async function seedTestData() {
  const passwordHash = await bcrypt.hash('Teacher123', 4);

  const admin = await testPrisma.user.create({
    data: {
      email: 'admin.test@example.com',
      passwordHash,
      fullName: 'Admin Test',
      role: 'ADMIN',
      address: 'Уфа, улица Ленина, 1',
    },
  });

  const teacher = await testPrisma.user.create({
    data: {
      email: 'teacher.test@example.com',
      passwordHash,
      fullName: 'Teacher Test',
      role: 'TEACHER',
      address: 'Уфа, проспект Октября, 10',
    },
  });

  const otherTeacher = await testPrisma.user.create({
    data: {
      email: 'teacher.other@example.com',
      passwordHash,
      fullName: 'Other Teacher',
      role: 'TEACHER',
    },
  });

  const client = await testPrisma.client.create({
    data: {
      fullName: 'Client Test',
      email: 'client.test@example.com',
      phone: '+79990000001',
      address: 'Уфа, улица Пушкина, 5',
      vip: true,
      userId: teacher.id,
    },
  });

  const secondClient = await testPrisma.client.create({
    data: {
      fullName: 'Second Client',
      email: 'second.client@example.com',
      phone: '+79990000002',
      address: 'Уфа, улица Комсомольская, 15',
      userId: teacher.id,
    },
  });

  const lesson = await testPrisma.lesson.create({
    data: {
      clientId: client.id,
      userId: teacher.id,
      startTime: new Date('2026-06-11T10:00:00+03:00'),
      durationMin: 60,
      type: 'INDIVIDUAL',
      status: 'PLANNED',
      participants: {
        create: [{ clientId: client.id }],
      },
    },
  });

  const event = await testPrisma.scheduleEvent.create({
    data: {
      userId: teacher.id,
      title: 'Личное событие',
      startTime: new Date('2026-06-12T18:00:00+03:00'),
      durationMin: 60,
      type: 'PERSONAL',
      status: 'ACTIVE',
      location: 'Уфа, улица Комсомольская, 15',
    },
  });

  const payment = await testPrisma.payment.create({
    data: {
      clientId: client.id,
      lessonId: lesson.id,
      amount: 1500,
      method: 'cash',
      dateTime: new Date('2026-06-11T11:00:00+03:00'),
      note: 'Тестовая оплата',
    },
  });

  const slotRequest = await testPrisma.slotRequest.create({
    data: {
      clientId: client.id,
      userId: teacher.id,
      status: 'PENDING',
      proposedSlots: [
        {
          from: '2026-06-11T12:00:00+03:00',
          to: '2026-06-11T13:00:00+03:00',
          status: 'PENDING',
        },
      ],
    },
  });

  const slotWeight = await testPrisma.slotWeight.create({
    data: {
      userId: teacher.id,
      wTime: 0.25,
      wCompact: 0.25,
      wWorkingDay: 0.2,
      wPriority: 0.15,
      wTravel: 0.15,
      workingDays: [1, 2, 3, 4, 5],
      preferredTimes: {},
      minGapMinutes: 30,
      maxGapMinutes: 180,
      desiredBreakMinutes: 30,
      gapImportance: 0.5,
    },
  });

  return {
    admin,
    teacher,
    otherTeacher,
    client,
    secondClient,
    lesson,
    event,
    payment,
    slotRequest,
    slotWeight,
    password: 'Teacher123',
  };
}
