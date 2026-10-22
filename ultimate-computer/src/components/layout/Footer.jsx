import React from 'react';
import { Monitor, Phone, Mail, MapPin, Clock, ArrowUp, ChevronRight } from 'lucide-react';

export const Footer = ({ setActivePage }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNav = (pageId) => {
    setActivePage(pageId);
    scrollToTop();
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 relative overflow-hidden pt-14 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Col 1: Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Monitor className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-black text-white tracking-tight">ULTIMATE </span>
                <span className="text-xl font-black gradient-text">COMPUTER</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-slate-200">
              Professional Computer Education & IT Training
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Career-focused computer education and practical skills development for students, job seekers, and working professionals.
            </p>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              {[
                { id: 'home', label: 'Home' },
                { id: 'courses', label: 'Courses' },
                { id: 'fee-structure', label: 'Fee Structure' },
                { id: 'admission', label: 'Admission' },
                { id: 'contact', label: 'Contact' },
                { id: 'login', label: 'Login' },
              ].map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => handleNav(link.id)}
                    className="flex items-center gap-2 text-slate-400 hover:text-blue-400 transition-colors group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors" />
                    <span>{link.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Offered Courses */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Certified Programs</h4>
            <ul className="space-y-2 text-sm">
              {[
                'Computer Fundamentals & Office Automation',
                'Advanced Computer Programming',
                'Web Development',
                'Graphic Design & Digital Skills',
              ].map((course, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => handleNav('courses')}
                    className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors group text-left"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" />
                    <span>{course}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Contact Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Contact Info</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
                <div>
                  <div className="text-xs text-slate-500">Helpline / Inquiry</div>
                  <a href="tel:+919422295496" className="text-slate-200 hover:text-blue-400 font-bold text-base transition-colors">
                    +91 9422295496
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-amber-400 mt-1 shrink-0" />
                <div className="text-slate-300 text-xs leading-relaxed">
                  Ultimate Computer Center, Main Road, City Campus
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-emerald-400 mt-1 shrink-0" />
                <div className="text-slate-300 text-xs">
                  Mon – Sat: 8:00 AM – 8:00 PM
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <div className="text-slate-500 text-center md:text-left">
            © 2026 Ultimate Computer. All rights reserved.
          </div>

          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <span>Back to Top</span>
            <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
          </button>
        </div>
      </div>
    </footer>
  );
};
