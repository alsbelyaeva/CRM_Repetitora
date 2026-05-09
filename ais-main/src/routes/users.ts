// routes/users.ts (обновлённый с auth middleware)
import { Router } from 'express';
import * as ctrl from '../controllers/usersController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Все маршруты защищены авторизацией
router.use(authMiddleware);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;