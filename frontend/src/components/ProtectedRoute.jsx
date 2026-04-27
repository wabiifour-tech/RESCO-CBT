import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (user?.role !== allowedRole) return <Navigate to="/" replace />;
  return children;
}
