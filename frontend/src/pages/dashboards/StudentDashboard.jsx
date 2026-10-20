import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/common/Navbar';
import { GraduationCap, BookOpen, Clock, Award, ShieldCheck } from 'lucide-react';

export const StudentDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Student Portal Authorized
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                Welcome, {user?.username}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Student Self-Service, Course Enrollments & Academic Records
              </p>
            </div>
            <div className="text-left sm:text-right bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong className="text-slate-800">Server Role:</strong> {user?.role}</div>
              <div><strong className="text-slate-800">Student ID:</strong> #{user?.id}</div>
              <div><strong className="text-slate-800">Email:</strong> {user?.email}</div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Registered Courses</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Enrolled</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attendance Rate</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Active</p>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl border border-teal-100">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">GPA Status</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">Good Standing</p>
            </div>
            <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl border border-cyan-100">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Graduation Track</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">On Track</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
