export default function Info() {
  return (
    <div className="max-w-2xl w-full">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4 md:mb-6">О программе</h1>
      <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
        <p className="text-gray-700 text-base md:text-lg leading-relaxed">
          Программа предназначена для специалистов, самостоятельно организующих свою работу с клиентами.
          Система позволяет вести расписание, учитывать занятия и оплаты, а также автоматически оценивать
          удобство предлагаемых временных слотов с учетом загруженности, личных событий и времени дороги
          между встречами.
        </p>
        <p className="text-gray-700 text-base md:text-lg leading-relaxed mt-4">
          Контакты для обратной связи:{' '}
          <a className="font-semibold text-blue-600 hover:text-blue-700" href="mailto:crmrepetitora@gmail.com">
            crmrepetitora@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}
