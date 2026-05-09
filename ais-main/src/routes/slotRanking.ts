import { Router } from 'express';
import * as ctrl from '../controllers/SlotRankingController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Применяем middleware авторизации ко всем роутам
router.use(authMiddleware);

// Ранжирование предложенных слотов
router.post('/rank', ctrl.rankSlots);

// Выбор слота и создание занятия
router.post('/select', ctrl.selectAndCreateLesson);

// Замена конфликтующего занятия
router.post('/replace', ctrl.replaceConflictingLesson);

export default router;