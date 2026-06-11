import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getPasswordIssues } from '../utils/passwordPolicy';


export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordIssues = useMemo(() => getPasswordIssues(newPassword), [newPassword]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!token) {
      setError('Ссылка сброса пароля недействительна');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (passwordIssues.length > 0) {
      setError(`Пароль недостаточно надежный. Добавьте: ${passwordIssues.join(', ')}.`);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`/api/auth/reset-password`, {
        token,
        newPassword,
        confirmPassword,
      });
      setMessage(response.data?.message || 'Пароль успешно изменен');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сбросить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="bg-white p-5 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-2">
          Новый пароль
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Введите новый надежный пароль для аккаунта
        </p>

        {!token && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            Ссылка сброса пароля недействительна
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Новый пароль
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              minLength={8}
              required
              disabled={loading || !token}
            />
          </div>

          {newPassword && passwordIssues.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4 text-sm">
              Добавьте: {passwordIssues.join(', ')}.
            </div>
          )}

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Повторите пароль
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              minLength={8}
              required
              disabled={loading || !token}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold shadow-md"
          >
            {loading ? 'Сохранение...' : 'Сменить пароль'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <Link to="/login" className="text-blue-600 hover:text-blue-800 font-semibold hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}