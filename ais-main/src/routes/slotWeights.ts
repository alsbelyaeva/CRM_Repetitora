import { Router } from 'express';
import * as ctrl from '../controllers/slotWeightsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/:userId', ctrl.getByUser);
router.put('/:userId', ctrl.update);

export default router;
