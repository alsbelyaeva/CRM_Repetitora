import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-lg bg-white p-5 shadow-2xl sm:p-8">
        <h1 className="text-2xl font-bold text-gray-800 sm:text-3xl">
          Политика обработки персональных данных
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          Документ фиксирует базовые условия обработки персональных данных в рамках MVP и дипломного проекта.
        </p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700 sm:text-base">
          <section>
            <h2 className="font-semibold text-gray-900">Цели обработки</h2>
            <p className="mt-1">
              Данные обрабатываются для регистрации пользователя, ведения клиентской базы, расписания, занятий,
              оплат, уведомлений, отчетности, восстановления доступа и оценки удобства предлагаемых временных слотов.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Категории данных</h2>
            <p className="mt-1">
              В системе могут храниться ФИО или имя пользователя, e-mail, телефон, адреса, данные клиентов,
              расписание, сведения о занятиях и оплатах, Telegram Chat ID, личные события и технические записи,
              необходимые для работы приложения.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Передача третьим лицам</h2>
            <p className="mt-1">
              Данные не передаются третьим лицам, кроме случаев, необходимых для работы подключенных сервисов:
              Telegram для уведомлений, SMTP для отправки писем и 2GIS для работы с адресами и маршрутизацией.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Права пользователя</h2>
            <p className="mt-1">
              Пользователь может запросить изменение, уточнение или удаление данных, а также задать вопрос об их
              обработке по адресу{' '}
              <a className="font-semibold text-blue-600 hover:text-blue-800" href="mailto:crmrepetitora@gmail.com">
                crmrepetitora@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-200 pt-5 text-sm">
          <Link to="/terms" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            Пользовательское соглашение
          </Link>
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
