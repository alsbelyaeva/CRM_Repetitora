// src/pages/Login.tsx
import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('❌ Ошибка логина:', err);
      
      // ✅ Подробная обработка ошибок
      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        setError('Сервер не отвечает. Проверьте подключение к сети.');
      } else if (err.response) {
        if (err.response.status === 401) {
          setError('Неверный email или пароль');
        } else if (err.response.status === 404) {
          setError('Эндпоинт не найден. Проверьте адрес API.');
        } else {
          const serverError = err.response.data?.error || err.response.data?.message;
          setError(serverError || `Ошибка сервера: ${err.response.status}`);
        }
      } else if (err.request) {
        console.error('📡 Нет ответа от сервера:', err.request);
        setError('Не удалось подключиться к серверу. Проверьте доступность backend и reverse proxy для /api.');
      } else {
        setError(err.message || 'Произошла неизвестная ошибка');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="bg-white p-5 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-2">
          Вход в систему
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Войдите в свой аккаунт
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <div className="font-semibold">Ошибка:</div>
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              placeholder="example@email.com"
              disabled={loading}
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Пароль <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              placeholder="••••••••"
              minLength={8}
              disabled={loading}
            />
            <div className="mt-2 text-right">
              <Link
                to="/forgot-password"
                className="text-sm text-blue-600 hover:text-blue-800 font-semibold hover:underline"
              >
                Забыли пароль?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold shadow-md"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Вход...
              </span>
            ) : 'Войти'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-center text-gray-600 text-sm">
            Нет аккаунта?{' '}
            <Link 
              to="/register" 
              className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
            >
              Зарегистрироваться
            </Link>
          </p>
          
          
          </div>
        </div>
      </div>
 
  );
}
