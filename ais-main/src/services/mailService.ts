import net from 'net';
import tls from 'tls';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const from = process.env.SMTP_FROM;

  if (!host || !port || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from,
  };
}

function escapeAddress(address: string) {
  return address.replace(/[<>\r\n]/g, '');
}

function buildResetMessage(from: string, to: string, resetUrl: string) {
  const safeFrom = escapeAddress(from);
  const safeTo = escapeAddress(to);

  return [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    'Subject: =?UTF-8?B?0KHQsdGA0L7RgSDQv9Cw0YDQvtC70Y8=?=',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Вы запросили сброс пароля в CRM-системе.',
    '',
    'Перейдите по ссылке, чтобы задать новый пароль:',
    resetUrl,
    '',
    'Ссылка действует 30 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.',
    '',
    '.',
  ].join('\r\n');
}

async function sendSmtpMail(config: SmtpConfig, to: string, resetUrl: string) {
  let socket: net.Socket | tls.TLSSocket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const client = config.secure
      ? tls.connect({ port: config.port, host: config.host }, () => resolve(client))
      : net.connect({ port: config.port, host: config.host }, () => resolve(client));

    client.once('error', reject);
  });

  socket.setEncoding('utf8');

  let buffer = '';
  const waitForResponse = () => new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP response timeout'));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      const completedLineIndex = lines.findIndex(line => /^\d{3} /.test(line));

      if (completedLineIndex >= 0) {
        const response = lines.slice(0, completedLineIndex + 1).join('\n');
        buffer = lines.slice(completedLineIndex + 1).join('\n');
        cleanup();
        resolve(response);
      }
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });

  const command = async (line: string, expectedPrefix: string | string[], sensitive = false) => {
    socket.write(`${line}\r\n`);
    const response = await waitForResponse();
    const prefixes = Array.isArray(expectedPrefix) ? expectedPrefix : [expectedPrefix];
    if (!prefixes.some(prefix => response.startsWith(prefix))) {
      throw new Error(`SMTP command failed: ${sensitive ? '[redacted]' : line} -> ${response}`);
    }
  };

  try {
    const greeting = await waitForResponse();
    if (!greeting.startsWith('220')) {
      throw new Error(`SMTP greeting failed: ${greeting}`);
    }

    await command(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`, '250');

    if (!config.secure) {
      await command('STARTTLS', '220');
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const secureSocket = tls.connect({
          socket,
          servername: config.host,
        }, () => resolve(secureSocket));

        secureSocket.once('error', reject);
      });
      socket.setEncoding('utf8');
      buffer = '';
      await command(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`, '250');
    }

    if (config.user && config.password) {
      await command('AUTH LOGIN', '334');
      await command(Buffer.from(config.user).toString('base64'), '334', true);
      await command(Buffer.from(config.password).toString('base64'), '235', true);
    }

    await command(`MAIL FROM:<${escapeAddress(config.from)}>`, '250');
    await command(`RCPT TO:<${escapeAddress(to)}>`, ['250', '251']);
    await command('DATA', '354');
    socket.write(`${buildResetMessage(config.from, to, resetUrl)}\r\n`);

    const dataResponse = await waitForResponse();
    if (!dataResponse.startsWith('250')) {
      throw new Error(`SMTP DATA failed: ${dataResponse}`);
    }

    await command('QUIT', '221');
  } finally {
    socket.end();
  }
}

export type PasswordResetEmailResult =
  | { success: true; skipped: false }
  | { success: false; skipped: true; reason: 'smtp_not_configured' }
  | { success: false; skipped: false; reason: 'smtp_error'; error: string };

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<PasswordResetEmailResult> {
  const config = getSmtpConfig();

  if (!config) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Password reset] SMTP не настроен. Ссылка сброса для ${to}: ${resetUrl}`);
    }
    return {
      success: false,
      skipped: true,
      reason: 'smtp_not_configured',
    };
  }

  try {
    await sendSmtpMail(config, to, resetUrl);
    console.log(`[Password reset] Письмо со ссылкой сброса отправлено на ${to}`);
    return {
      success: true,
      skipped: false,
    };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return {
      success: false,
      skipped: false,
      reason: 'smtp_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
