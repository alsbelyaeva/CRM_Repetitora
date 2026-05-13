import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import clientsRouter from './routes/clients';
import lessonsRouter from './routes/lessons';
import scheduleEventsRouter from './routes/scheduleEvents';
import paymentsRouter from './routes/payments';
import slotRequestsRouter from './routes/slotRequests';
import slotWeightsRouter from './routes/slotWeights';
import auditLogsRouter from './routes/auditLogs';
import slotRankingRouter from './routes/slotRanking';
import adminRouter from './routes/adminRoutes';
import telegramRouter from './routes/telegram';
import * as notificationRoutes from './routes/notification.routes';
import { authMiddleware } from './middleware/auth';
import { setupSwagger } from './utils/swagger';

const app = express();

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.31.106:5173',
];

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function isAllowedDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const isFrontendPort = url.port === '5173';
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    const isPrivateNetwork = (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );

    return isFrontendPort && (isLocalhost || isPrivateNetwork);
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const configuredOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;
    if (configuredOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin is not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

setupSwagger(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/auth', authRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/slots', slotRankingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/lessons', lessonsRouter);
app.use('/api/schedule-events', scheduleEventsRouter);
app.use('/api/slot-requests', slotRequestsRouter);
app.use('/api/slot-weights', slotWeightsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/users', usersRouter);

app.post('/api/notifications', authMiddleware, notificationRoutes.createNotification);
app.get('/api/notifications/:userId', authMiddleware, notificationRoutes.getUserNotifications);
app.patch('/api/notifications/:id/read', authMiddleware, notificationRoutes.markAsRead);
app.delete('/api/notifications/:id', authMiddleware, notificationRoutes.deleteNotification);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

export default app;
