import React from 'react';
import { Phone, MessageCircle, ArrowRight } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const ContactCTA = () => {
  return (
    <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-blue-500/30 bg-gradient-to-r from-slate-900/95 via-blue-950/40 to-slate-900/95 relative overflow-hidden text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-8">
      {/* Background Ambient Blur */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="space-y-3 max-w-xl z-10">
        <Badge variant="cyan">Direct Assistance</Badge>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">
          Have Questions About Admission?
        </h2>
        <p className="text-sm sm:text-base text-slate-300">
          Get in touch with <strong className="text-white">Ultimate Computer</strong>. Call or chat with us on WhatsApp at <strong className="text-blue-400 font-bold">+91 9422295496</strong> for course details and batch guidance.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full sm:w-auto z-10">
        {/* Call Now Button */}
        <a
          href="tel:+919422295496"
          className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all border border-blue-400/20 active:scale-95"
        >
          <Phone className="w-4 h-4" />
          <span>Call Now (+91 9422295496)</span>
        </a>

        {/* WhatsApp Button */}
        <a
          href="https://wa.me/919422295496?text=Hello%20Ultimate%20Computer,%20I%20have%20an%20admission%20query."
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all border border-emerald-400/20 active:scale-95"
        >
          <MessageCircle className="w-4 h-4" />
          <span>WhatsApp Us</span>
        </a>
      </div>
    </div>
  );
};
