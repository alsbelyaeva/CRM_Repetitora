import { Router } from 'express';
import * as ctrl from '../controllers/paymentsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', ctrl.getAll);
router.get('/stats', ctrl.getStats);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.delete('/:id', ctrl.remove);

export default router;
