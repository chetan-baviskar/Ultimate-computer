import React from 'react';

export const Badge = ({ children, variant = "primary", className = "" }) => {
  const variants = {
    primary: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    secondary: "bg-slate-800 text-slate-300 border-slate-700"
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border backdrop-blur-sm ${variants[variant] || variants.primary} ${className}`}>
      {children}
    </span>
  );
};
