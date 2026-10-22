import React from 'react';
import { Phone, Mail, Clock, MapPin, Award } from 'lucide-react';

export const TopHeader = () => {
  return (
    <div className="bg-slate-950 border-b border-slate-800/80 text-xs py-2 px-4 hidden md:block">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left Side Info */}
        <div className="flex items-center gap-6 text-slate-400">
          <a
            href="tel:+919422295496"
            className="flex items-center gap-2 hover:text-blue-400 transition-colors font-medium text-slate-200"
          >
            <Phone className="w-3.5 h-3.5 text-blue-400" />
            <span>Call Us: +91 9422295496</span>
          </a>
          <span className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-cyan-400" />
            <span>ultimategeorai@gmail.com</span>
          </span>
          <span className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Mon - Sat: 8:00 AM - 8:00 PM</span>
          </span>
        </div>

        {/* Right Side Badges */}
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            <Award className="w-3.5 h-3.5" />
            ISO 9001:2015 Certified
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            Main Campus, City Center
          </span>
        </div>
      </div>
    </div>
  );
};
