// src/components/Layout.tsx
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  Users, 
  Calendar as CalendarIcon, 
  DollarSign, 
  Clock, 
  Settings as SettingsIcon,
  FileText,
  LogOut,
  Info as InfoIcon,
  Menu,
  X,
  ClipboardList,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const emailVerified = Boolean(user?.emailVerifiedAt || user?.emailVerified);

  const menuItems = [
    { path: '/', icon: Home, label: 'Обзор' },
    { path: '/clients', icon: Users, label: 'Клиенты' },
    { path: '/calendar', icon: CalendarIcon, label: 'Расписание' },
    { path: '/payments', icon: DollarSign, label: 'Платежи' },
    { path: '/slot-requests', icon: Clock, label: 'Запросы слотов' },
    { path: '/reports', icon: FileText, label: 'Отчёты' },
    { path: '/settings', icon: SettingsIcon, label: 'Настройки' },
    { path: '/info', icon: InfoIcon, label: 'О программе' },
  ];

  // Добавляем пункт для администраторов
  const adminMenuItems = [
    { path: '/admin/users', icon: Users, label: 'Пользователи', adminOnly: true },
    { path: '/admin/audit-logs', icon: ClipboardList, label: 'Журнал действий', adminOnly: true }
  ];

  const isActivePath = (path: string) => (
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  );

  const renderMenuLink = (item: { path: string; icon: any; label: string }) => (
    <Link
      key={item.path}
      to={item.path}
      onClick={() => setMobileMenuOpen(false)}
      className={`flex items-center px-4 lg:px-6 py-3 text-gray-700 transition-colors ${
        isActivePath(item.path)
          ? 'bg-blue-50 text-blue-700 font-semibold'
          : 'hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <item.icon className="w-5 h-5 mr-3 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );

  const sidebarContent = (
    <>
      <div className="p-4 lg:p-6 shrink-0">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-800">CRM Система</h1>
        <p className="text-sm text-gray-600 mt-1 break-words">{user?.fullName || user?.email}</p>
        <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
          {user?.role === 'ADMIN' ? 'Администратор' : 'Преподаватель'}
        </span>
        {user?.email && (
          <span className={`inline-flex items-center mt-2 px-2 py-1 text-xs rounded ${
            emailVerified
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}>
            {emailVerified ? (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            ) : (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
          </span>
        )}
      </div>

      <nav className="mt-2 flex-1 overflow-y-auto pb-3">
        {menuItems.map(renderMenuLink)}

        {user?.role === 'ADMIN' && (
          <>
            <div className="px-4 lg:px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Администрирование
            </div>
            {adminMenuItems.map(renderMenuLink)}
          </>
        )}
      </nav>

      <div className="shrink-0 p-4 lg:p-6 bg-white border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center w-full min-h-[44px] px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3 shrink-0" />
          <span className="truncate">Выйти</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full max-w-full bg-gray-100 md:flex md:h-screen overflow-x-hidden">
      <aside className="hidden md:flex md:w-56 lg:w-64 md:shrink-0 bg-white shadow-md overflow-hidden flex-col">
        {sidebarContent}
      </aside>

      <header className="md:hidden sticky top-0 z-40 bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-bold text-gray-900">CRM Система</div>
          <div className="text-xs text-gray-500 truncate max-w-[220px]">{user?.fullName || user?.email}</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-700"
          aria-label="Открыть меню"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Закрыть меню"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[86vw] bg-white shadow-xl overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Закрыть меню"
            >
              <X className="w-6 h-6" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-6 xl:p-8">
        <Outlet />
      </main>
    </div>
  );
}
