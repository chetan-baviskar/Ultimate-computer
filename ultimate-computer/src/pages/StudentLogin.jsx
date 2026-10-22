import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as authService from '../services/authService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { UserCheck, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

/** Shown when the address has no Firebase Authentication user yet. */
const MIGRATION_MESSAGE =
  'No sign-in account exists for this email address. If you created your account before the website upgrade, contact the office on +91 9422295496 (or use Forgot Password) to request account migration — existing passwords are never reset automatically.';

export const StudentLogin = ({ setActivePage }) => {
  const { loginStudent } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getErrorMessage = (error) => {
    if (!error) return 'An unknown error occurred during authentication.';

    const code = error.code || '';
    const message = typeof error.message === 'string' ? error.message : String(error || '');

    if (message.includes('Role Mismatch')) {
      return message;
    }

    switch (code) {
      case 'INVALID_CREDENTIALS':
      case 'USER_NOT_FOUND':
      case 'WRONG_PASSWORD':
        return 'Invalid email or password. Please verify your login credentials.';
      case 'INVALID_EMAIL':
        return 'Enter a valid email address.';
      case 'USER_DISABLED':
        return 'This account has been disabled. Please contact the office.';
      case 'MISSING_FIELDS':
        return 'Please enter both your email address and password.';
      case 'TOO_MANY_REQUESTS':
        return 'Too many sign-in attempts. Please wait a minute and try again.';
      case 'NO_TOKEN':
      case 'INVALID_TOKEN':
      case 'TOKEN_EXPIRED':
      case 'USER_GONE':
        return 'Your session could not be restored. Please log in again.';
      case 'NETWORK_ERROR':
        return 'Network connection error. Please check your internet connection.';
      case 'TIMEOUT':
        return 'The login request timed out. Please try again in a moment.';
      case 'PROFILE_MISSING':
        return 'Your sign-in was verified, but your student profile is missing. Please contact the office to complete your registration.';
      case 'AUTH_PROVIDER_DISABLED':
        return 'Email/password sign-in is not enabled for this project yet. Please contact the office.';
      case 'DATA_LAYER_UNAVAILABLE':
        return 'Login is temporarily unavailable while the authentication service is being upgraded. Please try again later.';
      default:
        if (error.status === 401) {
          return 'Invalid email or password. Please verify your login credentials.';
        }
        if (error.status === 503) {
          return 'Login is temporarily disabled while the authentication service is being upgraded. Please try again later.';
        }
        if (error.status >= 500) {
          return 'Login service is temporarily unavailable. Please try again shortly.';
        }
        return message || 'Failed to authenticate student account. Please check your network or credentials.';
    }
  };

  /**
   * When credentials are rejected, ask the API whether the address simply has
   * no Firebase Authentication user yet (i.e. it predates the upgrade) so the
   * student gets the correct recovery guidance instead of a misleading
   * "wrong password".
   */
  const resolveLoginErrorMessage = async (error, submittedEmail) => {
    const base = getErrorMessage(error);
    const code = error?.code || '';
    if (code !== 'INVALID_CREDENTIALS' && code !== 'USER_NOT_FOUND') return base;

    try {
      const status = await authService.getMigrationStatus(submittedEmail);
      if (status?.migrationNeeded) return MIGRATION_MESSAGE;
    } catch {
      // Could not check (API down / offline) — keep the generic message.
    }
    return base;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginStudent(cleanEmail, password);
      setActivePage('student-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Student login error:", error);
      setErrorMsg(await resolveLoginErrorMessage(error, cleanEmail));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center space-y-2 mb-6">
        <Badge variant="primary" className="mx-auto">Student Portal</Badge>
        <h2 className="text-2xl font-extrabold text-white">Student Login</h2>
        <p className="text-xs text-slate-400">Access your course syllabus, practical lab schedule & status</p>
      </div>

      <Card className="border border-slate-800 bg-slate-900/90 p-8 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Student Email Address *
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="e.g. student@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Password *
              </label>
              <button
                type="button"
                onClick={() => setActivePage('forgot-password')}
                className="text-xs text-blue-400 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
              />
              <span>Remember me on this browser</span>
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            icon={LogIn}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Authenticating..." : "Sign In as Student"}
          </Button>
        </form>

        {/* Links */}
        <div className="pt-4 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Don't have a student account?{' '}
            <button
              onClick={() => setActivePage('register')}
              className="text-blue-400 font-semibold hover:underline"
            >
              Create Account
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
};
