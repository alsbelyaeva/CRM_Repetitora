import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { logAuditAction } from '../services/auditLogService';

function canAccessUserSettings(req: Request, targetUserId: string): boolean {
  return req.user?.role === 'ADMIN' || req.userId === targetUserId;
}

const DEFAULT_SLOT_WEIGHTS = {
  wTime: 0.3,
  wCompact: 0.3,
  wWorkingDay: 0.2,
  wPriority: 0.2,
  wTravel: 0.15,
};

const WEIGHT_KEYS = ['wTime', 'wCompact', 'wWorkingDay', 'wPriority', 'wTravel'] as const;

function numberOrDefault(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getWeightSum(weights: Record<typeof WEIGHT_KEYS[number], unknown>) {
  return WEIGHT_KEYS.reduce((sum, key) => sum + numberOrDefault(weights[key], 0), 0);
}

function getWeightValue(value: unknown, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  return Number(value);
}

// Получить все веса (для админа)
export async function getAll(req: Request, res: Response) {
  try {
    console.log('🔍 [SlotWeights] Получение всех весов');

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    const weights = await prisma.slotWeight.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true
          }
        }
      }
    });
    
    res.json(weights);
  } catch (err: any) {
    console.error('❌ [SlotWeights] Ошибка получения всех весов:', err);
    res.status(500).json({ 
      error: 'Ошибка при получении весов', 
      details: err.message 
    });
  }
}

// Создать веса
export async function create(req: Request, res: Response) {
  try {
    const { userId, wTime, wCompact, wWorkingDay, wPriority, wTravel, workingDays, preferredTimes, minGapMinutes, maxGapMinutes, desiredBreakMinutes, gapImportance } = req.body;
    
    console.log('➕ [SlotWeights] Создание весов для пользователя:', userId);
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'Требуется userId' 
      });
    }

    if (!canAccessUserSettings(req, userId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    // Проверяем существование пользователя
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!userExists) {
      return res.status(404).json({ 
        error: 'Пользователь не найден' 
      });
    }
    
    // Проверяем, нет ли уже весов для этого пользователя
    const existingWeights = await prisma.slotWeight.findUnique({
      where: { userId }
    });
    
    if (existingWeights) {
      return res.status(400).json({ 
        error: 'Веса для этого пользователя уже существуют' 
      });
    }

    const nextWeights = {
      wTime: numberOrDefault(wTime, DEFAULT_SLOT_WEIGHTS.wTime),
      wCompact: numberOrDefault(wCompact, DEFAULT_SLOT_WEIGHTS.wCompact),
      wWorkingDay: numberOrDefault(wWorkingDay, DEFAULT_SLOT_WEIGHTS.wWorkingDay),
      wPriority: numberOrDefault(wPriority, DEFAULT_SLOT_WEIGHTS.wPriority),
      wTravel: numberOrDefault(wTravel, DEFAULT_SLOT_WEIGHTS.wTravel),
    };

    if (getWeightSum(nextWeights) <= 0) {
      return res.status(400).json({
        error: 'Хотя бы один вес ранжирования должен быть больше 0',
      });
    }
    
    const weights = await prisma.slotWeight.create({
      data: {
        userId,
        ...nextWeights,
        workingDays: workingDays || [1, 2, 3, 4, 5],
        preferredTimes: preferredTimes || {
          morning: { period: 'morning', enabled: false, weight: 0.5 },
          day: { period: 'day', enabled: true, weight: 0.7 },
          evening: { period: 'evening', enabled: false, weight: 0.5 }
        },
        minGapMinutes: Number(minGapMinutes) || 60,
        maxGapMinutes: Number(maxGapMinutes) || 180,
        desiredBreakMinutes: Number(desiredBreakMinutes) || 30,
        gapImportance: Number(gapImportance) || 0.5
      }
    });
    
    console.log('✅ [SlotWeights] Веса успешно созданы');

    await logAuditAction({
      userId,
      action: 'slotWeights.create',
      entity: 'SlotWeight',
      entityId: weights.id,
      details: {
        changedBy: req.userId,
        weights: {
          wTime: weights.wTime,
          wCompact: weights.wCompact,
          wWorkingDay: weights.wWorkingDay,
          wPriority: weights.wPriority,
          wTravel: weights.wTravel,
        },
      },
    });
    
    res.status(201).json(weights);
  } catch (err: any) {
    console.error('❌ [SlotWeights] Ошибка создания весов:', err);
    res.status(500).json({ 
      error: 'Ошибка при создании весов', 
      details: err.message 
    });
  }
}

export async function getByUser(req: Request, res: Response) {
  try {
    const userId = req.params.userId;
    
    console.log('🔍 [SlotWeights.getByUser] Получение весов для пользователя:', userId);

    if (!canAccessUserSettings(req, userId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    let weights = await prisma.slotWeight.findUnique({
      where: { userId }
    });
    
    if (!weights) {
      console.log('⚠️ Веса не найдены, создаем по умолчанию');
      // Создаем веса по умолчанию
      weights = await prisma.slotWeight.create({
        data: {
          userId,
          wTime: 0.3,
          wCompact: 0.3,
          wWorkingDay: 0.2,
          wPriority: 0.2,
          wTravel: 0.15,
          workingDays: [1, 2, 3, 4, 5],
          preferredTimes: {
            morning: { period: 'morning', enabled: false, weight: 0.5 },
            day: { period: 'day', enabled: true, weight: 0.7 },
            evening: { period: 'evening', enabled: false, weight: 0.5 }
          },
          minGapMinutes: 60,
          maxGapMinutes: 180,
          desiredBreakMinutes: 30,
          gapImportance: 0.5
        }
      });
      console.log('✅ [SlotWeights] Созданы веса по умолчанию');
    }
    
    res.json(weights);
  } catch (err: any) {
    console.error('❌ [SlotWeights.getByUser] Ошибка получения весов:', err);
    res.status(500).json({ 
      error: 'Ошибка при получении весов', 
      details: err.message 
    });
  }
}

export async function update(req: Request, res: Response) {
  try {
    const userId = req.params.userId;
    const { 
      wTime, 
      wCompact, 
      wWorkingDay,
      wPriority, 
      wTravel,
      workingDays, 
      preferredTimes, 
      minGapMinutes, 
      maxGapMinutes, 
      desiredBreakMinutes,
      gapImportance 
    } = req.body;
    
    console.log('📝 [SlotWeights.update] Обновление весов для пользователя:', userId);
    console.log('📦 Новые данные:', { 
      wTime, 
      wCompact, 
      wWorkingDay,
      wPriority, 
      wTravel,
      workingDays, 
      preferredTimes,
      minGapMinutes,
      maxGapMinutes,
      desiredBreakMinutes,
      gapImportance
    });

    if (!canAccessUserSettings(req, userId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const existingWeights = await prisma.slotWeight.findUnique({
      where: { userId }
    });

    const nextWeights = {
      wTime: getWeightValue(wTime, existingWeights?.wTime ?? DEFAULT_SLOT_WEIGHTS.wTime),
      wCompact: getWeightValue(wCompact, existingWeights?.wCompact ?? DEFAULT_SLOT_WEIGHTS.wCompact),
      wWorkingDay: getWeightValue(wWorkingDay, existingWeights?.wWorkingDay ?? DEFAULT_SLOT_WEIGHTS.wWorkingDay),
      wPriority: getWeightValue(wPriority, existingWeights?.wPriority ?? DEFAULT_SLOT_WEIGHTS.wPriority),
      wTravel: getWeightValue(wTravel, existingWeights?.wTravel ?? DEFAULT_SLOT_WEIGHTS.wTravel),
    };

    if (WEIGHT_KEYS.some((key) => !Number.isFinite(nextWeights[key]))) {
      return res.status(400).json({
        error: 'Веса ранжирования должны быть числами'
      });
    }

    if (getWeightSum(nextWeights) <= 0) {
      return res.status(400).json({
        error: 'Хотя бы один вес ранжирования должен быть больше 0'
      });
    }
    
    // Валидация базовых весов
    if (wTime !== undefined && wCompact !== undefined && wWorkingDay !== undefined && wPriority !== undefined && wTravel !== undefined) {
      const sum = Number(wTime) + Number(wCompact) + Number(wWorkingDay) + Number(wPriority) + Number(wTravel);
      if (Math.abs(sum - 1.0) > 0.1) {
        console.warn(`⚠️ Сумма весов ${sum.toFixed(2)} далека от 1.0`);
      }
    }
    
    // Валидация рабочих дней
    if (workingDays !== undefined) {
      if (!Array.isArray(workingDays) || workingDays.length === 0) {
        return res.status(400).json({
          error: 'workingDays должен быть непустым массивом'
        });
      }
      
      if (workingDays.some((day: number) => day < 0 || day > 6)) {
        return res.status(400).json({
          error: 'workingDays должен содержать числа от 0 до 6'
        });
      }
    }
    
    // Валидация промежутков
    if (minGapMinutes !== undefined && maxGapMinutes !== undefined) {
      if (Number(minGapMinutes) > Number(maxGapMinutes)) {
        return res.status(400).json({
          error: 'minGapMinutes не может быть больше maxGapMinutes'
        });
      }
    }

    if (desiredBreakMinutes !== undefined && Number(desiredBreakMinutes) < 0) {
      return res.status(400).json({
        error: 'desiredBreakMinutes не может быть отрицательным'
      });
    }
    
    // Подготавливаем данные для обновления
    const updateData: any = {};
    
    if (wTime !== undefined) updateData.wTime = Number(wTime);
    if (wCompact !== undefined) updateData.wCompact = Number(wCompact);
    if (wWorkingDay !== undefined) updateData.wWorkingDay = Number(wWorkingDay);
    if (wPriority !== undefined) updateData.wPriority = Number(wPriority);
    if (wTravel !== undefined) updateData.wTravel = Number(wTravel);
    if (workingDays !== undefined) updateData.workingDays = workingDays;
    if (preferredTimes !== undefined) updateData.preferredTimes = preferredTimes;
    if (minGapMinutes !== undefined) updateData.minGapMinutes = Number(minGapMinutes);
    if (maxGapMinutes !== undefined) updateData.maxGapMinutes = Number(maxGapMinutes);
    if (desiredBreakMinutes !== undefined) updateData.desiredBreakMinutes = Number(desiredBreakMinutes);
    if (gapImportance !== undefined) updateData.gapImportance = Number(gapImportance);
    
    updateData.updatedAt = new Date();
    
    // Upsert (создать или обновить)
    const weights = await prisma.slotWeight.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...nextWeights,
        workingDays: workingDays || [1, 2, 3, 4, 5],
        preferredTimes: preferredTimes || {
          morning: { period: 'morning', enabled: false, weight: 0.5 },
          day: { period: 'day', enabled: true, weight: 0.7 },
          evening: { period: 'evening', enabled: false, weight: 0.5 }
        },
        minGapMinutes: Number(minGapMinutes) || 60,
        maxGapMinutes: Number(maxGapMinutes) || 180,
        desiredBreakMinutes: Number(desiredBreakMinutes) || 30,
        gapImportance: Number(gapImportance) || 0.5
      }
    });
    
    console.log('✅ [SlotWeights.update] Веса успешно обновлены');

    await logAuditAction({
      userId,
      action: 'slotWeights.update',
      entity: 'SlotWeight',
      entityId: weights.id,
      details: {
        changedBy: req.userId,
        weights: {
          wTime: weights.wTime,
          wCompact: weights.wCompact,
          wWorkingDay: weights.wWorkingDay,
          wPriority: weights.wPriority,
          wTravel: weights.wTravel,
        },
        desiredBreakMinutes: weights.desiredBreakMinutes,
      },
    });
    
    res.json(weights);
  } catch (err: any) {
    console.error('❌ [SlotWeights.update] Ошибка обновления весов:', err);
    res.status(500).json({ 
      error: 'Ошибка при обновлении весов', 
      details: err.message 
    });
  }
}

export async function deleteWeights(req: Request, res: Response) {
  try {
    const userId = req.params.userId;
    
    console.log('🗑️ [SlotWeights] Удаление весов для пользователя:', userId);

    if (!canAccessUserSettings(req, userId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    await prisma.slotWeight.delete({
      where: { userId }
    });
    
    console.log('✅ [SlotWeights] Веса успешно удалены');

    await logAuditAction({
      userId,
      action: 'slotWeights.delete',
      entity: 'SlotWeight',
      entityId: userId,
      details: {
        changedBy: req.userId,
      },
    });
    
    res.json({ message: 'Веса удалены' });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Веса не найдены' });
    }
    console.error('❌ [SlotWeights] Ошибка удаления весов:', err);
    res.status(500).json({ 
      error: 'Ошибка при удалении весов', 
      details: err.message 
    });
  }
}
