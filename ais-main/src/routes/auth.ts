import { Router } from 'express';
import * as ctrl from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.post('/email-verification/request', authMiddleware, ctrl.requestEmailVerification);
router.post('/email-verification/confirm', ctrl.verifyEmail);
router.get('/me', authMiddleware, ctrl.getMe);
router.patch('/password', authMiddleware, ctrl.changePassword);

export default router;
