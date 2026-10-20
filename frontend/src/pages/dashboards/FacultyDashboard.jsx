import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/common/Navbar';
import { BookOpen, GraduationCap, ClipboardCheck, Calendar, ShieldCheck } from 'lucide-react';

export const FacultyDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Faculty Portal Authorized
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Welcome, Prof. {user?.username}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Academic Management, Grading & Course Instruction Portal
              </p>
            </div>
            <div className="text-left sm:text-right bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong className="text-slate-800">Server Role:</strong> {user?.role}</div>
              <div><strong className="text-slate-800">Faculty ID:</strong> #{user?.id}</div>
              <div><strong className="text-slate-800">Email:</strong> {user?.email}</div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Assigned Classes</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Active</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attendance</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Ready</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Course Schedule</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Term 2026</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Grade Submissions</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Open</p>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FacultyDashboard;
