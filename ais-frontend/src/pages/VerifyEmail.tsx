import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type VerificationState = 'loading' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState('Проверяем ссылку подтверждения...');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setState('error');
      setMessage('В ссылке подтверждения отсутствует token.');
      return;
    }

    axios.post(`/api/auth/email-verification/confirm`, { token })
      .then(async (response) => {
        setState('success');
        setMessage(response.data?.message || 'Email успешно подтверждён.');
        if (user) {
          await refreshUser();
        }
      })
      .catch((error) => {
        setState('error');
        setMessage(error.response?.data?.error || 'Не удалось подтвердить email.');
      });
  }, [searchParams, user, refreshUser]);

  const success = state === 'success';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="bg-white p-5 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
        <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${
          state === 'loading'
            ? 'bg-indigo-50 text-indigo-700'
            : success
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {state === 'loading' ? (
            <Mail className="w-7 h-7" />
          ) : success ? (
            <CheckCircle2 className="w-7 h-7" />
          ) : (
            <AlertCircle className="w-7 h-7" />
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mt-4">
          Подтверждение email
        </h2>

        <div className={`mt-5 px-4 py-3 rounded border text-sm ${
          state === 'loading'
            ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
            : success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <Link
            to={user ? '/settings' : '/login'}
            className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
          >
            {user ? 'Перейти в настройки' : 'Вернуться ко входу'}
          </Link>
        </div>
      </div>
    </div>
  );
}
