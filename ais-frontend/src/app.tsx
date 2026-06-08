// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientForm from './pages/ClientForms';
import Calendar from './pages/Calendar';
import Payments from './pages/Payments';
import SlotRequests from './pages/SlotRequests';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Info from './pages/info';
import AdminClients from './pages/AdminClients';
import AdminUsers from './pages/AdminUsers';
import AuditLogs from './pages/AuditLogs';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Загрузка...</div>;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
}

// Маршрут только для администраторов
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Загрузка...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (user.role !== 'ADMIN') {
    return <Navigate to="/" />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/new" element={<ClientForm />} />
            <Route path="clients/:id" element={<ClientForm />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="payments" element={<Payments />} />
            <Route path="slot-requests" element={<SlotRequests />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="info" element={<Info />} />
            
            {/* Админские маршруты */}
            <Route path="admin/clients" element={
              <AdminRoute>
                <AdminClients />
              </AdminRoute>
            } />
            <Route path="admin/users" element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            } />
            <Route path="admin/audit-logs" element={
              <AdminRoute>
                <AuditLogs />
              </AdminRoute>
            } />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
