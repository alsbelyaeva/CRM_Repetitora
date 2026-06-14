import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getPasswordPolicyError } from '../utils/passwordPolicy';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../services/mailService';
import { logAuditAction } from '../services/auditLogService';
import { normalizeEmail, validateAccountEmail } from '../utils/emailValidation';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const PASSWORD_RESET_TTL_MINUTES = 30;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashEmailVerificationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function register(req: Request, res: Response) {
  try {
    console.log('🔧 [Auth.register] Регистрация нового пользователя');
    
    const { email, password, fullName, acceptedTerms, acceptedPrivacyPolicy } = req.body;

    if (!email || !password) {
      console.log('❌ [Auth.register] Отсутствует email или пароль');
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    if (acceptedTerms !== true) {
      return res.status(400).json({ error: 'Необходимо принять Пользовательское соглашение' });
    }

    if (acceptedPrivacyPolicy !== true) {
      return res.status(400).json({ error: 'Необходимо дать согласие на обработку персональных данных' });
    }

    const emailValidation = await validateAccountEmail(email);
    if (!emailValidation.valid) {
      console.log('❌ [Auth.register] Некорректный email:', emailValidation.error);
      return res.status(400).json({ error: emailValidation.error });
    }

    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      return res.status(400).json({ error: passwordPolicyError });
    }

    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: emailValidation.email,
          mode: 'insensitive',
        },
      },
    });
    if (existing) {
      console.log('❌ [Auth.register] Пользователь уже существует:', email);
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const consentAcceptedAt = new Date();

    const user = await prisma.user.create({
      data: {
        email: emailValidation.email,
        passwordHash,
        fullName: fullName || null,
        acceptedTermsAt: consentAcceptedAt,
        acceptedPrivacyPolicyAt: consentAcceptedAt,
        role: 'TEACHER',
      },
    });

    // Создаем токен с правильной структурой
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: user.role,
        fullName: user.fullName 
      }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    console.log(`✅ [Auth.register] Пользователь создан: ${user.email} (ID: ${user.id})`);

    await logAuditAction({
      userId: user.id,
      action: 'auth.register',
      entity: 'User',
      entityId: user.id,
      details: {
        role: user.role,
      },
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerifiedAt: user.emailVerifiedAt,
        emailVerified: Boolean(user.emailVerifiedAt),
        acceptedTermsAt: user.acceptedTermsAt,
        acceptedPrivacyPolicyAt: user.acceptedPrivacyPolicyAt,
        address: user.address,
        telegramChatId: user.telegramChatId,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error('❌ [Auth.register] Ошибка регистрации:', err);
    res.status(500).json({ 
      error: 'Ошибка при регистрации', 
      details: err.message 
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    console.log('🔧 [Auth.login] Попытка входа');
    
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';

    if (!email || !password) {
      console.log('❌ [Auth.login] Отсутствует email или пароль');
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const user = await prisma.user.findFirst({ 
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        emailVerifiedAt: true,
        acceptedTermsAt: true,
        acceptedPrivacyPolicyAt: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
      }
    });
    
    if (!user) {
      console.log('❌ [Auth.login] Пользователь не найден:', normalizedEmail);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      console.log('❌ [Auth.login] Неверный пароль для пользователя:', email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Создаем токен (не включаем passwordHash в payload!)
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: user.role,
        fullName: user.fullName 
      }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    console.log(`✅ [Auth.login] Успешный вход: ${user.email} (ID: ${user.id})`);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerifiedAt: user.emailVerifiedAt,
        emailVerified: Boolean(user.emailVerifiedAt),
        acceptedTermsAt: user.acceptedTermsAt,
        acceptedPrivacyPolicyAt: user.acceptedPrivacyPolicyAt,
        address: user.address,
        telegramChatId: user.telegramChatId,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error('❌ [Auth.login] Ошибка входа:', err);
    res.status(500).json({ 
      error: 'Ошибка при входе', 
      details: err.message 
    });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Введите email аккаунта.' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Введите email аккаунта.' });
    }

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Аккаунт с таким email не найден.',
        emailFound: false,
        emailSent: false,
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const delivery = await sendPasswordResetEmail(user.email, resetUrl);

    await logAuditAction({
      userId: user.id,
      action: 'auth.passwordReset.request',
      entity: 'User',
      entityId: user.id,
      details: {
        deliveryAttempted: true,
        emailSent: delivery.success,
        deliveryReason: delivery.success ? 'sent' : delivery.reason,
      },
    });

    if (delivery.success) {
      return res.json({
        message: `Аккаунт найден. Письмо со ссылкой для сброса пароля отправлено на ${user.email}.`,
        emailFound: true,
        emailSent: true,
      });
    }

    if (delivery.reason === 'smtp_not_configured') {
      return res.status(503).json({
        error: process.env.NODE_ENV === 'production'
          ? 'Аккаунт найден, но почтовая отправка не настроена. Письмо не отправлено.'
          : 'Аккаунт найден, но SMTP-почта не настроена. Письмо не отправлено; ссылка сброса записана в логи backend.',
        emailFound: true,
        emailSent: false,
      });
    }

    return res.status(502).json({
      error: 'Аккаунт найден, но письмо отправить не удалось. Проверьте настройки SMTP.',
      emailFound: true,
      emailSent: false,
      details: process.env.NODE_ENV === 'production' ? undefined : delivery.error,
    });
  } catch (err: any) {
    console.error('❌ [Auth.forgotPassword] Ошибка запроса сброса пароля:', err);
    return res.status(500).json({
      error: 'Ошибка при обработке запроса сброса пароля',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}

export async function requestEmailVerification(req: Request, res: Response) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    if (user.emailVerifiedAt) {
      return res.json({
        message: 'Email уже подтверждён.',
        emailVerified: true,
        emailSent: false,
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashEmailVerificationToken(token);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({
        where: {
          userId: user.id,
          email: user.email,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      }),
      prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          email: user.email,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const verificationUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const delivery = await sendEmailVerificationEmail(user.email, verificationUrl);

    await logAuditAction({
      userId: user.id,
      action: 'auth.emailVerification.request',
      entity: 'User',
      entityId: user.id,
      details: {
        emailSent: delivery.success,
        deliveryReason: delivery.success ? 'sent' : delivery.reason,
      },
    });

    if (delivery.success) {
      return res.json({
        message: `Письмо для подтверждения email отправлено на ${user.email}.`,
        emailVerified: false,
        emailSent: true,
      });
    }

    if (delivery.reason === 'smtp_not_configured') {
      return res.status(503).json({
        error: process.env.NODE_ENV === 'production'
          ? 'Почтовая отправка не настроена. Письмо подтверждения не отправлено.'
          : 'SMTP-почта не настроена. Письмо подтверждения не отправлено; ссылка записана в логи backend.',
        emailVerified: false,
        emailSent: false,
      });
    }

    return res.status(502).json({
      error: 'Письмо подтверждения отправить не удалось. Проверьте настройки SMTP.',
      emailVerified: false,
      emailSent: false,
      details: process.env.NODE_ENV === 'production' ? undefined : delivery.error,
    });
  } catch (err: any) {
    console.error('❌ [Auth.requestEmailVerification] Ошибка запроса подтверждения email:', err);
    return res.status(500).json({
      error: 'Ошибка при запросе подтверждения email',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Некорректная ссылка подтверждения email' });
    }

    const tokenHash = hashEmailVerificationToken(token);
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!verificationToken) {
      return res.status(400).json({ error: 'Ссылка подтверждения недействительна или уже использована' });
    }

    if (normalizeEmail(verificationToken.email) !== normalizeEmail(verificationToken.user.email)) {
      return res.status(400).json({
        error: 'Email аккаунта изменился после отправки письма. Запросите новую ссылку подтверждения.',
      });
    }

    if (verificationToken.usedAt) {
      if (verificationToken.user.emailVerifiedAt) {
        return res.json({
          message: 'Email уже подтверждён.',
          emailVerified: true,
          emailVerifiedAt: verificationToken.user.emailVerifiedAt,
        });
      }

      return res.status(400).json({ error: 'Ссылка подтверждения недействительна или уже использована' });
    }

    if (verificationToken.expiresAt < new Date()) {
      if (verificationToken.user.emailVerifiedAt) {
        return res.json({
          message: 'Email уже подтверждён.',
          emailVerified: true,
          emailVerifiedAt: verificationToken.user.emailVerifiedAt,
        });
      }

      return res.status(400).json({ error: 'Срок действия ссылки подтверждения истёк' });
    }

    const verifiedAt = verificationToken.user.emailVerifiedAt || new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: verifiedAt },
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await logAuditAction({
      userId: verificationToken.userId,
      action: 'auth.emailVerification.confirm',
      entity: 'User',
      entityId: verificationToken.userId,
      details: {
        email: verificationToken.email,
      },
    });

    return res.json({
      message: 'Email успешно подтверждён.',
      emailVerified: true,
      emailVerifiedAt: verifiedAt,
    });
  } catch (err: any) {
    console.error('❌ [Auth.verifyEmail] Ошибка подтверждения email:', err);
    return res.status(500).json({
      error: 'Ошибка при подтверждении email',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || typeof token !== 'string' || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Укажите токен и новый пароль дважды' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Новые пароли не совпадают' });
    }

    const passwordPolicyError = getPasswordPolicyError(newPassword);
    if (passwordPolicyError) {
      return res.status(400).json({ error: passwordPolicyError });
    }

    const tokenHash = hashResetToken(token);
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            passwordHash: true,
          },
        },
      },
    });

    if (!resetToken) {
      return res.status(400).json({
        error: 'Ссылка сброса пароля недействительна или срок ее действия истек',
      });
    }

    const samePassword = await bcrypt.compare(newPassword, resetToken.user.passwordHash);
    if (samePassword) {
      return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const usedAt = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt },
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.user.id,
          usedAt: null,
        },
        data: { usedAt },
      }),
    ]);

    await logAuditAction({
      userId: resetToken.user.id,
      action: 'auth.passwordReset.complete',
      entity: 'User',
      entityId: resetToken.user.id,
      details: {
        completedAt: usedAt,
      },
    });

    return res.json({ message: 'Пароль успешно изменен. Теперь можно войти с новым паролем.' });
  } catch (err: any) {
    console.error('❌ [Auth.resetPassword] Ошибка сброса пароля:', err);
    return res.status(500).json({
      error: 'Ошибка при сбросе пароля',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    console.log('🔧 [Auth.getMe] Запрос данных пользователя');
    
    // Используем req.userId вместо (req as any).userId
    const userId = req.userId;
    
    console.log('🔧 [getMe] userId из middleware:', userId);
    
    if (!userId) {
      console.log('❌ [getMe] userId не найден в запросе');
      return res.status(401).json({ 
        error: 'Не авторизован',
        details: 'Токен не содержит идентификатор пользователя'
      });
    }

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerifiedAt: true,
        acceptedTermsAt: true,
        acceptedPrivacyPolicyAt: true,
        address: true,
        telegramChatId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      console.log('❌ [getMe] Пользователь не найден в БД:', userId);
      return res.status(404).json({ 
        error: 'Пользователь не найден',
        details: 'Пользователь был удален или не существует'
      });
    }

    console.log(`✅ [getMe] Данные пользователя отправлены: ${user.email}`);
    
    res.json({
      ...user,
      emailVerified: Boolean(user.emailVerifiedAt),
    });
  } catch (err: any) {
    console.error('❌ [Auth.getMe] Ошибка получения данных пользователя:', err);
    res.status(500).json({ 
      error: 'Ошибка получения данных пользователя', 
      details: err.message 
    });
  }
}

export async function changePassword(req: Request, res: Response) {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Заполните текущий пароль и два поля нового пароля' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Новые пароли не совпадают' });
    }

    const passwordPolicyError = getPasswordPolicyError(newPassword);
    if (passwordPolicyError) {
      return res.status(400).json({ error: passwordPolicyError });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Текущий пароль указан неверно' });
    }

    const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (samePassword) {
      return res.status(400).json({ error: 'Новый пароль должен отличаться от текущего' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await logAuditAction({
      userId: user.id,
      action: 'auth.password.change',
      entity: 'User',
      entityId: user.id,
      details: {
        changedBy: user.id,
      },
    });

    res.json({ message: 'Пароль успешно изменен' });
  } catch (err: any) {
    console.error('❌ [Auth.changePassword] Ошибка смены пароля:', err);
    res.status(500).json({
      error: 'Ошибка при смене пароля',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
}
