# AIS

Backend для дипломного проекта AIS (Automated Information System).

---

## Структура проекта
ais-backend/
├─ src/ # Исходный код TypeScript
│ ├─ controllers/ # Контроллеры
│ ├─ routes/ # Маршруты
│ └─ index.ts # Точка входа
├─ prisma/ # Prisma schema, миграции и сиды
├─ tests/ # Тесты
├─ dist/ # Скомпилированные JS-файлы (игнорируется в Git)
├─ .env # Переменные окружения (игнорируется в Git)
├─ package.json
├─ tsconfig.json
└─ .gitignore
---

## Установка

1. Клонировать репозиторий:

git clone https://github.com/USERNAME/ais-backend.git
cd ais-backend

2. Установить зависимости:
   npm install

3. Создать файл .env в корне проекта со своими переменными окружения, например:
   DATABASE_URL="postgresql://user:password@localhost:5432/ais_db"
   JWT_SECRET="your-secret-key"
   PORT=4000

---
 Запуск
Режим разработки с горячей перезагрузкой:
npm run dev

Сборка TypeScript и запуск продакшн:
npm run build
npm start

Сиды базы данных
Чтобы заполнить базу начальными данными:
npm run seed

Проверка содержимого таблиц через Prisma Client:
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(users);
}

main().finally(() => prisma.$disconnect());

Тесты
npm test

Примечания
Файлы node_modules/, dist/, .env и логи не включены в Git.
Сервер по умолчанию запускается на http://localhost:4000.
Prisma используется для работы с PostgreSQL.

## Lab 3 (RESTful + OpenAPI) — How to run

1. **Install dependencies** (Node 18+ recommended):
   ```bash
   npm install
   ```

2. **Configure database** (PostgreSQL). Set `DATABASE_URL` in `.env`, e.g.:
   ```env
   DATABASE_URL="postgresql://user:pass@localhost:5432/ais?schema=public"
   ```

3. **Run Prisma migrations and seed (optional)**:
   ```bash
   npx prisma migrate dev
   npm run seed
   ```

4. **Start the API**:
   ```bash
   npm run dev
   # or
   npm run build && npm start
   ```

5. **Open Swagger UI**: http://localhost:4000/docs

### What was added for Lab 3
- REST endpoints are already implemented using Express + Prisma.
- **Swagger UI** mounted at `/docs` and **OpenAPI spec** provided at `src/openapi.yaml`.
- Endpoints documented for Users, Clients, Lessons, Payments, Slot Requests, Slot Weights, and Audit Logs.
