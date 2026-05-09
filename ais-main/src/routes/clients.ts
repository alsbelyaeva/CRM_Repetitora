import { Router } from 'express';
import * as ctrl from '../controllers/clientsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Защита всех маршрутов
router.use(authMiddleware);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.softDelete);

export default router;
