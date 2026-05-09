import { Router } from 'express';
import * as ctrl from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.get('/me', authMiddleware, ctrl.getMe);
router.patch('/password', authMiddleware, ctrl.changePassword);

export default router;
