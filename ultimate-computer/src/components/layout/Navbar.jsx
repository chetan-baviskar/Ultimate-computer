import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, Monitor, Phone, Sparkles, LogOut, User, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';

export const Navbar = ({ activePage, setActivePage }) => {
  const { currentUser, userProfile, role, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'courses', label: 'Courses' },
    { id: 'fee-structure', label: 'Fee Structure' },
    { id: 'admission', label: 'Admission' },
    { id: 'about', label: 'About' },
    { id: 'contact', label: 'Contact' },
  ];

  // Dynamic login or role-protected dashboard link based on auth state
  if (currentUser) {
    if (role === 'admin') {
      navLinks.push({ id: 'admin-dashboard', label: 'Admin Dashboard' });
    } else {
      navLinks.push({ id: 'student-dashboard', label: 'Student Dashboard' });
    }
  } else {
    navLinks.push({ id: 'login', label: 'Login' });
  }

  const handleNavClick = (pageId) => {
    setActivePage(pageId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    await logout();
    setActivePage('home');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      className={`sticky top-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/90 shadow-2xl py-3'
          : 'bg-slate-950/70 backdrop-blur-md border-b border-slate-800/40 py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-3 group text-left focus:outline-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-white">
                  ULTIMATE
                </span>
                <span className="text-xl font-black tracking-tight gradient-text">
                  COMPUTER
                </span>
              </div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 -mt-1">
                Computer Education & IT Training
              </p>
            </div>
          </button>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-1 xl:gap-1.5">
            {navLinks.map((link) => {
              const isActive = activePage === link.id;
              const isDashboard = link.id === 'student-dashboard' || link.id === 'admin-dashboard';
              const isLogin = link.id === 'login';

              return (
                <button
                  key={link.id}
                  onClick={() => handleNavClick(link.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                      : isDashboard
                      ? role === 'admin'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                      : isLogin
                      ? 'text-slate-200 hover:text-white bg-slate-800/60 hover:bg-slate-800'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>

          {/* Desktop Right CTA / Auth Status */}
          <div className="hidden lg:flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleNavClick(role === 'admin' ? 'admin-dashboard' : 'student-dashboard')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white hover:border-blue-500/30 transition-colors"
                >
                  {role === 'admin' ? <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> : <User className="w-3.5 h-3.5 text-blue-400" />}
                  <span className="truncate max-w-[120px]">{userProfile?.fullName || currentUser.email?.split('@')[0]}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${role === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                    {role || 'user'}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <a
                  href="tel:+919422295496"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-blue-400" />
                  <span>+91 9422295496</span>
                </a>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Sparkles}
                  onClick={() => handleNavClick('admission')}
                >
                  Apply Now
                </Button>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex lg:hidden items-center gap-2">
            <a
              href="tel:+919422295496"
              className="p-2 text-blue-400 hover:bg-slate-800 rounded-lg"
              title="Call Helpline"
            >
              <Phone className="w-5 h-5" />
            </a>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[65px] bg-slate-950/95 backdrop-blur-2xl border-b border-slate-800 p-5 shadow-2xl transition-all duration-300">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => {
              const isActive = activePage === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => handleNavClick(link.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold transition-all flex items-center justify-between ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <span>{link.label}</span>
                  {isActive && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                </button>
              );
            })}

            <div className="pt-4 mt-2 border-t border-slate-800 flex flex-col gap-3">
              {currentUser ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold"
                >
                  <LogOut className="w-4 h-4" />
                  Logout ({currentUser.email})
                </button>
              ) : (
                <>
                  <a
                    href="tel:+919422295496"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-semibold"
                  >
                    <Phone className="w-4 h-4 text-blue-400" />
                    Call Helpline: +91 9422295496
                  </a>
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => handleNavClick('admission')}
                  >
                    Apply Now
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
