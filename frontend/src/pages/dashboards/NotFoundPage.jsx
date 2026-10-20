import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleDashboardPath } from '../../components/auth/PublicOnlyRoute';
import { HelpCircle, Home } from 'lucide-react';
import Button from '../../components/common/Button';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const targetPath = isAuthenticated && user?.role ? getRoleDashboardPath(user.role) : '/login';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-xl">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 border border-blue-200 rounded-2xl flex items-center justify-center mx-auto">
          <HelpCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Page Not Found (404)</h1>
          <p className="text-sm text-slate-500">
            The page you are looking for does not exist or has been relocated within the ERP system.
          </p>
        </div>

        <div className="pt-2">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => navigate(targetPath, { replace: true })}
            icon={Home}
          >
            Return to Portal
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
