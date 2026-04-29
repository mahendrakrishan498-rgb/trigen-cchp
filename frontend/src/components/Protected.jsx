import { Navigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import Navbar from './Navbar';

export default function Protected({ children, admin = false }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">{children}</main>
    </div>
  );
}
