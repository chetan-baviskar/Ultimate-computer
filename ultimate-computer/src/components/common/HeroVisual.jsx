import React from 'react';
import { motion } from 'framer-motion';
import { Monitor, Code, Cpu, Terminal, ShieldCheck, Sparkles } from 'lucide-react';

export const HeroVisual = () => {
  return (
    <div className="relative w-full max-w-lg mx-auto flex items-center justify-center p-4">
      {/* Subtle Glowing Background Circle */}
      <div className="absolute w-72 h-72 bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 rounded-full blur-3xl" />

      {/* Main Visual Container */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl relative w-full z-10 space-y-6"
      >
        {/* Mock Computer Screen Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            ultimate-computer-lab.sys
          </span>
        </div>

        {/* Floating Animated Cards Grid */}
        <div className="space-y-3 font-mono text-xs">
          {/* Card 1: Interactive Coding Visual */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-slate-300"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Code className="w-4 h-4" />
              </div>
              <div>
                <div className="text-white font-semibold">Practical Coding & IT</div>
                <div className="text-[10px] text-slate-500">Hands-on Lab Exercises</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-sans font-semibold">
              Active Lab
            </span>
          </motion.div>

          {/* Card 2: Modern Learning Skills */}
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-slate-300"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <div className="text-white font-semibold">Office & Web Applications</div>
                <div className="text-[10px] text-slate-500">Industry Oriented Modules</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-sans font-semibold">
              4 Courses
            </span>
          </motion.div>

          {/* Card 3: Career Guidance */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between text-slate-300"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-white font-semibold">Career-Focused Training</div>
                <div className="text-[10px] text-slate-500">Skill Development</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-sans font-semibold">
              Student Guidance
            </span>
          </motion.div>
        </div>

        {/* Footer Badge */}
        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800">
          <span className="flex items-center gap-1 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-blue-400" /> Dedicated Workstations
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Experienced Faculty
          </span>
        </div>
      </motion.div>
    </div>
  );
};
