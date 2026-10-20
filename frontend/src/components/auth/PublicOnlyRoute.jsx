import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const getRoleDashboardPath = (role) => {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'FACULTY':
      return '/faculty/dashboard';
    case 'STUDENT':
      return '/student/dashboard';
    default:
      return '/login';
  }
};

/**
 * PublicOnlyRoute Guard
 * Redirects already authenticated users directly to their designated role dashboard
 */
export const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading portal...</p>
      </div>
    );
  }

  if (isAuthenticated && user?.role) {
    return <Navigate to={getRoleDashboardPath(user.role)} replace />;
  }

  return children;
};

export default PublicOnlyRoute;
