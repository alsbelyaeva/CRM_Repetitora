import { Router } from 'express';
import { getClients, getClientById } from '../controllers/adminClients';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

router.use(authMiddleware, requireRole(['ADMIN']));

router.get('/clients', getClients);
router.get('/clients/:id', getClientById);

export default router;
