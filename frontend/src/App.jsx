import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import AdminPanel from './components/AdminPanel';
import ProtectedRoute from './components/ProtectedRoute';
import useAuthStore from './store/authStore';

export default function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to={`/${user?.role?.toLowerCase()}`} replace /> : <LoginPage />} />
      <Route path="/student" element={<ProtectedRoute allowedRole="STUDENT"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute allowedRole="TEACHER"><TeacherDashboard /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRole="ADMIN"><AdminPanel /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
