import React from 'react';
import { UserPlus, BookOpen, FileText, CheckCircle2 } from 'lucide-react';
import { SectionHeader } from '../ui/SectionHeader';

export const AdmissionSteps = () => {
  const steps = [
    {
      step: "01",
      title: "Create Account",
      description: "Sign up on our student portal or visit campus to register.",
      icon: UserPlus,
    },
    {
      step: "02",
      title: "Select Course",
      description: "Choose from our 4 specialized computer training programs.",
      icon: BookOpen,
    },
    {
      step: "03",
      title: "Fill Admission Form",
      description: "Provide your basic details, qualification, and batch preference.",
      icon: FileText,
    },
    {
      step: "04",
      title: "Submit Application",
      description: "Submit online or at campus to confirm your admission slot.",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-12">
      <SectionHeader
        badge="Simple Process"
        title="How Admission Works"
        subtitle="Follow these 4 easy steps to start your computer learning journey at Ultimate Computer."
      />

      <div className="relative">
        {/* Subtle connecting line on desktop */}
        <div className="hidden lg:block absolute top-1/2 left-12 right-12 h-0.5 bg-gradient-to-r from-blue-600/30 via-cyan-500/30 to-blue-600/30 -translate-y-6 z-0" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-blue-500/40 transition-all duration-300 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl font-black text-slate-700 group-hover:text-blue-400/40 transition-colors font-mono">
                      {item.step}
                    </span>
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-1 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                  <span>Step {item.step} of 04</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
