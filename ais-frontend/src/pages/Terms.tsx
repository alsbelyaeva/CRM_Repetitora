import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-lg bg-white p-5 shadow-2xl sm:p-8">
        <h1 className="text-2xl font-bold text-gray-800 sm:text-3xl">
          Пользовательское соглашение
        </h1>
        <p className="mt-3 text-sm text-gray-500">
          Настоящее соглашение описывает базовые правила использования CRM-системы для индивидуального специалиста.
        </p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700 sm:text-base">
          <section>
            <h2 className="font-semibold text-gray-900">Назначение системы</h2>
            <p className="mt-1">
              Приложение предназначено для автоматизации планирования рабочего процесса индивидуального специалиста:
              ведения клиентов, расписания, занятий, оплат, уведомлений, отчетности и восстановления доступа.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Аккаунт и данные</h2>
            <p className="mt-1">
              Пользователь самостоятельно указывает данные в системе и отвечает за их корректность, актуальность и
              правомерность внесения сведений о клиентах, занятиях, оплатах и личных событиях.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Внешние сервисы</h2>
            <p className="mt-1">
              Для работы отдельных функций могут использоваться внешние сервисы, включая Telegram для уведомлений,
              SMTP-сервис для отправки писем и 2GIS для расчета адресов и маршрутов.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">Изменение и удаление данных</h2>
            <p className="mt-1">
              Пользователь может запросить изменение или удаление своих данных, обратившись по адресу{' '}
              <a className="font-semibold text-blue-600 hover:text-blue-800" href="mailto:crmrepetitora@gmail.com">
                crmrepetitora@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-200 pt-5 text-sm">
          <Link to="/privacy" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            Политика обработки персональных данных
          </Link>
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
