import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/common/Navbar';
import { ShieldCheck, Users, KeyRound, Database, Activity, Lock, AlertTriangle } from 'lucide-react';

export const AdminDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Administrative Authority Verified
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Welcome, {user?.username || 'Administrator'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Centralized ERP Administration & Security Control Center
              </p>
            </div>
            <div className="text-left sm:text-right bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong className="text-slate-800">Server Role:</strong> {user?.role}</div>
              <div><strong className="text-slate-800">User ID:</strong> #{user?.id}</div>
              <div><strong className="text-slate-800">Session Status:</strong> Active (8h Token)</div>
            </div>
          </div>
        </div>

        {/* Security Architecture Note */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs sm:text-sm text-blue-900">
          <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p>
            <strong>Architectural Security Notice:</strong> Client-side route guards provide responsive UI navigation. Backend endpoints strictly validate stateless JWT signatures and RBAC permissions on every request. Self-service account registration remains permanently disabled.
          </p>
        </div>

        {/* Quick Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">User Directory</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Provisioned</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Auth Method</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Argon2id + JWT</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Database State</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Connected</p>
            </div>
            <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-100">
              <Database className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Brute-Force Guard</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Enforced</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <Activity className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Administration Modules Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-slate-800">User Administration</h2>
            <p className="text-xs text-slate-500">
              Manage student, faculty, and administrative accounts, role assignments, and account activation states.
            </p>
            <span className="inline-block text-xs font-medium text-blue-600">Module active in ERP</span>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-slate-800">Security Audits</h2>
            <p className="text-xs text-slate-500">
              Review authentication logs, failed login thresholds, lockouts, and cryptographic password reset events.
            </p>
            <span className="inline-block text-xs font-medium text-blue-600">Auditing active in ERP</span>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-slate-800">Academic Modules</h2>
            <p className="text-xs text-slate-500">
              Configure academic terms, departments, courses, student enrollment, and faculty course assignments.
            </p>
            <span className="inline-block text-xs font-medium text-blue-600">Scheduled for ERP core</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
