import React, { useState } from 'react';
import { StudentLogin } from './StudentLogin';
import { AdminLogin } from './AdminLogin';
import { UserCheck, ShieldCheck } from 'lucide-react';

export const Login = ({ setActivePage, initialTab = 'student' }) => {
  const [activeTab, setActiveTab] = useState(initialTab); // 'student' | 'admin'

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Tab Selector */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          onClick={() => setActiveTab('student')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'student'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Student Portal Login</span>
        </button>

        <button
          onClick={() => setActiveTab('admin')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'admin'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Admin Portal Login</span>
        </button>
      </div>

      {/* Render Selected Login Tab */}
      {activeTab === 'student' ? (
        <StudentLogin setActivePage={setActivePage} />
      ) : (
        <AdminLogin setActivePage={setActivePage} />
      )}
    </div>
  );
};
