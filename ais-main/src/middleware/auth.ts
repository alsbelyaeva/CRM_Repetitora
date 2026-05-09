import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        fullName?: string;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Не авторизован',
        details: 'Требуется токен авторизации в формате: Bearer <token>',
      });
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({ error: 'Пустой токен' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id || decoded.userId || decoded.sub;

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({
        error: 'Неверный токен',
        details: 'ID пользователя не найден или имеет неверный формат',
      });
    }

    req.userId = userId;
    req.user = {
      id: userId,
      email: decoded.email || '',
      role: decoded.role || 'TEACHER',
      fullName: decoded.fullName,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Токен истек',
        details: 'Срок действия токена истек. Пожалуйста, войдите снова.',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Неверный токен',
        details: 'Токен поврежден или недействителен',
      });
    }

    console.error('Auth error:', err);
    return res.status(500).json({
      error: 'Ошибка аутентификации',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Доступ запрещен',
        details: `Требуемая роль: ${allowedRoles.join(', ')}. Ваша роль: ${req.user.role}`,
      });
    }

    next();
  };
}
