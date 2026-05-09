// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/apiBase';

interface User {
  id: string;
  email: string;
  fullName?: string;
  address?: string | null;
  telegramChatId?: string | null;
  role: 'ADMIN' | 'TEACHER';
  name: 'Пользователи',
  href: '/admin/users',
  icon: User,
  adminOnly: true
}
  
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // ИСПРАВЛЕНО: "Authorization" вместо "Авторизация"
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async (): Promise<User | null> => {
    try {
      console.log('🔍 Извлечение пользователя из:', `${API_URL}/api/auth/me`);
      const response = await axios.get(`${API_URL}/api/auth/me`);
      console.log('✅ User fetched:', response.data);
      setUser(response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Не удалось найти пользователя:', error);
      console.error('📄 Подробные сведения об ошибке:', error.response?.data);
      logout();
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => fetchUser();

  const login = async (email: string, password: string) => {
    try {
      console.log('🔐 Вход в систему для:', `${API_URL}/api/auth/login`);
      const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      console.log('✅ Ответ на вход в систему:', response.data);
      
      const { token: newToken, user: userData } = response.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
      // ИСПРАВЛЕНО: "Authorization" вместо "Aвторизация"
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    } catch (error: any) {
      console.error('❌ Ошибка входа в систему:', error.response?.data || error.message);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
   
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
