import { Router } from 'express';
import * as ctrl from '../controllers/slotRequestsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.patch('/:id/accept', ctrl.acceptSlot);
router.patch('/:id/reject', ctrl.rejectSlot);
router.patch('/:id/restore', ctrl.restore);
router.patch('/:id/slots/:slotIndex/cancel-selection', ctrl.cancelSlotSelection);
router.patch('/:id/slots/:slotIndex/restore', ctrl.restoreSlot);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);


export default router;
