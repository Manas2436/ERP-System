import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, LogOut, ShieldCheck, User } from 'lucide-react';

const ROLE_BADGES = {
  ADMIN: {
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    label: 'Administrator',
  },
  FACULTY: {
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Faculty',
  },
  STUDENT: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Student',
  },
};

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const badge = user?.role ? ROLE_BADGES[user.role] : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shadow-sm">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 tracking-tight leading-none">
              College ERP
            </h1>
            <p className="text-xs text-slate-500 font-medium">Enterprise Management System</p>
          </div>
        </div>

        {/* User Info & Logout */}
        {user && (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-semibold text-slate-800 flex items-center justify-end gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
                {user.username}
              </span>
              <span className="text-xs text-slate-500">{user.email}</span>
            </div>

            {badge && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.bg}`}
              >
                <ShieldCheck className="w-3 h-3 mr-1" />
                {badge.label}
              </span>
            )}

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label="Log out of application"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
