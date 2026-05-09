import 'dotenv/config';
import app from './app';
import { startLessonReminderScheduler } from './services/lessonReminderScheduler';
import { startTelegramUpdatePolling } from './services/telegramUpdatePollingService';

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  startLessonReminderScheduler();
  startTelegramUpdatePolling();
});
