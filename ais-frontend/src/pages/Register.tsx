// src/pages/Register.tsx
import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { getPasswordIssues, getPasswordPolicyError } from '../utils/passwordPolicy';


export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    acceptedTerms: false,
    acceptedPrivacyPolicy: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const passwordIssues = getPasswordIssues(formData.password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Валидация
    if (!formData.email || !formData.password || !formData.fullName) {
      setError('Заполните все обязательные поля');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(formData.password);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      return;
    }

    if (!formData.acceptedTerms || !formData.acceptedPrivacyPolicy) {
      setError('Для регистрации необходимо принять пользовательское соглашение и дать согласие на обработку персональных данных');
      return;
    }

    setLoading(true);

    try {
      console.log('🚀 Отправка регистрации на:', `/api/auth/register`);

      const response = await axios.post(`/api/auth/register`, {
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        acceptedTerms: formData.acceptedTerms,
        acceptedPrivacyPolicy: formData.acceptedPrivacyPolicy,
        role: 'TEACHER' // Всегда регистрируем как преподавателя
      });

      console.log('✅ Регистрация успешна:', response.data);

      // Сохраняем токен и настраиваем axios
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        console.log('✅ Токен сохранён, перенаправление на главную...');
        
        setTimeout(() => {
          navigate('/', { replace: true });
          window.location.reload();
        }, 500);
      } else {
        setError('Токен не получен от сервера');
      }
    } catch (err: any) {
      console.error('❌ Ошибка регистрации:', err);
      setError(err.response?.data?.error || err.message || 'Ошибка при регистрации. Попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="bg-white p-5 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-2">
          Регистрация
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Создайте новый аккаунт преподавателя
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="example@email.com"
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Полное имя <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Иванов Иван Иванович"
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Телефон (опционально)
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+7 (999) 123-45-67"
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Пароль <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="••••••••"
              minLength={8}
            />
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              <p className="font-medium">Пароль должен содержать:</p>
              {formData.password && passwordIssues.length === 0 ? (
                <p className="text-emerald-700">Требования выполнены</p>
              ) : (
                <ul className="list-disc pl-5">
                  {(formData.password ? passwordIssues : [
                    'минимум 8 символов',
                    'цифру',
                    'строчную латинскую букву a-z',
                    'заглавную латинскую букву A-Z',
                    'без простых шаблонов вроде 12345678 или qwertyui',
                  ]).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Подтвердите пароль <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="••••••••"
            />
          </div>

          <div className="mb-6 space-y-3 text-sm text-gray-700">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={formData.acceptedTerms}
                onChange={(e) => setFormData({ ...formData, acceptedTerms: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                required
              />
              <span>
                Я принимаю{' '}
                <Link to="/terms" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                  Пользовательское соглашение
                </Link>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={formData.acceptedPrivacyPolicy}
                onChange={(e) => setFormData({ ...formData, acceptedPrivacyPolicy: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                required
              />
              <span>
                Я даю согласие на обработку персональных данных и ознакомлен(а) с{' '}
                <Link to="/privacy" className="font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                  Политикой обработки персональных данных
                </Link>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !formData.acceptedTerms || !formData.acceptedPrivacyPolicy}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-800 font-semibold">
              Войти
            </Link>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <Link to="/terms" className="hover:text-blue-700 hover:underline">
              Пользовательское соглашение
            </Link>
            <Link to="/privacy" className="hover:text-blue-700 hover:underline">
              Политика обработки персональных данных
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
