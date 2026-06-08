import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';


export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
      setMessage(response.data?.message || 'Письмо со ссылкой для сброса пароля отправлено.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Письмо для сброса пароля не отправлено');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="bg-white p-5 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-2">
          Восстановление пароля
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Укажите email аккаунта, и мы отправим ссылку для сброса пароля
        </p>

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
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={loading}
              placeholder="example@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold shadow-md"
          >
            {loading ? 'Отправка...' : 'Отправить ссылку'}
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
