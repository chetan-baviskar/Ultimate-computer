import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export const AdminLogin = ({ setActivePage }) => {
  const { loginAdmin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter administrative email and security passcode.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginAdmin(email.trim(), password);
      setActivePage('admin-dashboard');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Admin login error:", error);
      const code = error.code || '';
      const status = error.status || 0;

      if (code === 'INVALID_CREDENTIALS' || code === 'USER_NOT_FOUND') {
        // Deliberately identical for "wrong password" and "no such account"
        // so this form cannot be used to discover which addresses are admins.
        // The footer below tells the visitor how access is actually granted.
        setErrorMsg(
          'Incorrect administrative email or password. Please verify your credentials — administrator accounts are provisioned server-side, so contact the system administrator if you need access.'
        );
      } else if (code === 'ACCESS_DENIED') {
        setErrorMsg('This account does not have administrative privileges. Please use the Student Portal Login instead.');
      } else if (code === 'TOO_MANY_REQUESTS') {
        setErrorMsg('Too many sign-in attempts. Please wait a minute and try again.');
      } else if (code === 'USER_DISABLED') {
        setErrorMsg('This administrator account has been disabled. Please contact the system administrator.');
      } else if (code === 'PROFILE_MISSING' || status === 409) {
        setErrorMsg(
          'This account can sign in, but its administrator profile has not been provisioned yet. Please contact the system administrator to complete the setup.'
        );
      } else if (code === 'DATA_LAYER_UNAVAILABLE' || status === 503) {
        setErrorMsg(
          'Login is temporarily unavailable while the authentication service is being upgraded. Please try again later.'
        );
      } else if (code === 'NO_TOKEN' || code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED' || status === 401) {
        // The sign-in session could not be verified server-side (expired/forged
        // token or an interrupted sign-in) — NOT a credential problem.
        setErrorMsg('Your sign-in session could not be verified. Please try again, and contact the system administrator if the problem persists.');
      } else if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || status >= 500 || !status) {
        // API unreachable (proxy 502/503/504, server not running, or network failure)
        setErrorMsg('Cannot reach the login service. Please make sure the API server is running ("npm run server"), then try again.');
      } else {
        setErrorMsg(error.message || 'Failed to authenticate the admin session. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center space-y-2 mb-6">
        <Badge variant="amber" className="mx-auto flex items-center gap-1.5 w-fit">
          <ShieldCheck className="w-4 h-4" /> Restricted Access
        </Badge>
        <h2 className="text-2xl font-extrabold text-white">Admin Authentication</h2>
        <p className="text-xs text-slate-400">Secure management portal for Ultimate Computer administrators</p>
      </div>

      <Card className="border border-slate-800 bg-slate-900/90 p-8 space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-5">
          {/* Admin Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Admin Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="admin email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Admin Passcode */}
          <div>
            <div className="mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Security Passcode *
              </label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter security key"
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full bg-gradient-to-r from-slate-800 via-blue-600 to-slate-800 hover:from-blue-600 hover:to-blue-500"
            icon={LogIn}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Verifying Credentials..." : "Authenticate Admin Session"}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Administrator accounts are provisioned server-side only. Contact the
            system administrator if you need access.
          </p>
        </div>
      </Card>
    </div>
  );
};
