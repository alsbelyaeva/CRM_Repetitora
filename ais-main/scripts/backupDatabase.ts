import 'dotenv/config';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '_' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
}

function parseDatabaseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error('DATABASE_URL задан в некорректном формате.');
  }
}

async function runBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан. Резервное копирование невозможно.');
  }

  const url = parseDatabaseUrl(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const host = url.hostname;
  const port = url.port || '5432';

  if (!database || !username || !host) {
    throw new Error('DATABASE_URL должен содержать host, пользователя и имя базы данных.');
  }

  const backupsDir = path.resolve(process.cwd(), 'backups');
  mkdirSync(backupsDir, { recursive: true });

  const fileName = `backup_${timestamp()}.sql`;
  const outputPath = path.join(backupsDir, fileName);
  const args = [
    '--host', host,
    '--port', port,
    '--username', username,
    '--dbname', database,
    '--file', outputPath,
    '--format', 'plain',
    '--no-owner',
    '--no-privileges',
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('pg_dump', args, {
      env: {
        ...process.env,
        PGPASSWORD: password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(
          'pg_dump не найден. Установите PostgreSQL tools и добавьте pg_dump в PATH ' +
          'или выполните резервное копирование внутри Docker-контейнера db.'
        ));
        return;
      }
      reject(error);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump завершился с кодом ${code}. ${stderr.trim()}`.trim()));
    });
  });

  console.log(`Резервная копия создана: ${outputPath}`);
}

runBackup().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
