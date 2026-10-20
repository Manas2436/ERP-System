import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleDashboardPath } from '../../components/auth/PublicOnlyRoute';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import Button from '../../components/common/Button';

export const UnauthorizedPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const attemptedPath = location.state?.attemptedPath || 'the requested resource';
  const homePath = user?.role ? getRoleDashboardPath(user.role) : '/login';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-xl">
        <div className="w-16 h-16 bg-red-50 text-red-600 border border-red-200 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Access Denied (403)</h1>
          <p className="text-sm text-slate-500">
            Your server-issued role (<strong className="text-blue-700">{user?.role || 'UNAUTHENTICATED'}</strong>)
            does not have sufficient permission to access <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 text-xs">{attemptedPath}</code>.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => navigate(-1)}
            icon={ArrowLeft}
          >
            Go Back
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => navigate(homePath, { replace: true })}
            icon={Home}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UnauthorizedPage;
