import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Phone, ShieldCheck, ArrowLeft, MapPin, Mail, Send, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import * as authService from '../services/authService';

/**
 * Account recovery, powered by Firebase Authentication:
 *  - a registered address gets a genuine Firebase password-reset email
 *  - an address with NO Firebase sign-in account (an account created before the
 *    upgrade) gets the account-migration request path instead. Migration is
 *    verified by the office — no password is ever reset and no account is ever
 *    created automatically.
 */
export const ForgotPassword = ({ setActivePage }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);

  // Migration request form
  const [migrationName, setMigrationName] = useState('');
  const [migrationMobile, setMigrationMobile] = useState('');
  const [migrationSubmitting, setMigrationSubmitting] = useState(false);
  const [migrationError, setMigrationError] = useState('');
  const [migrationSuccess, setMigrationSuccess] = useState('');

  const resetMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setMigrationError('');
    setMigrationSuccess('');
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Please enter the email address you registered with.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Firebase never reveals whether an address has an account (privacy), so
      // ask our API first: an address that still needs migrating must NOT be
      // told "reset link sent" when there is no account to reset.
      let migrationNeeded = false;
      try {
        const status = await authService.getMigrationStatus(cleanEmail);
        migrationNeeded = Boolean(status?.migrationNeeded);
      } catch (statusError) {
        // API unreachable — continue with Firebase (which is silent either way).
        console.warn('Migration status check failed:', statusError?.message);
      }

      if (migrationNeeded) {
        setNeedsMigration(true);
        setErrorMsg(
          'No sign-in account exists for this email address. If you registered before the website upgrade, request an account migration below — your existing password will not be changed.'
        );
        return;
      }

      await authService.sendPasswordReset(cleanEmail);
      setSuccessMsg(`A password reset link was sent to ${cleanEmail}. Open it to choose a new password — the link expires after a short time.`);
      setNeedsMigration(false);
    } catch (error) {
      console.error('Password reset error:', error);
      const code = error.code || '';

      if (code === 'USER_NOT_FOUND' || code === 'INVALID_CREDENTIALS') {
        // No sign-in account for this address — find out whether it is a
        // pre-upgrade account that still needs migrating.
        let migrationNeeded = false;
        try {
          const status = await authService.getMigrationStatus(cleanEmail);
          migrationNeeded = Boolean(status?.migrationNeeded);
        } catch {
          migrationNeeded = code === 'USER_NOT_FOUND';
        }

        if (migrationNeeded) {
          setNeedsMigration(true);
          setErrorMsg(
            'No sign-in account exists for this email address. If you registered before the website upgrade, request an account migration below — your existing password will not be changed.'
          );
        } else {
          setErrorMsg('No account was found for this address. Please check the email or contact the office.');
        }
      } else if (code === 'TOO_MANY_REQUESTS') {
        setErrorMsg('Too many attempts. Please wait a minute and try again.');
      } else if (code === 'NETWORK_ERROR') {
        setErrorMsg('Network connection error. Please check your internet connection.');
      } else if (code === 'AUTH_PROVIDER_DISABLED') {
        setErrorMsg('Password reset emails are not enabled for this project yet. Please contact the office.');
      } else {
        setErrorMsg(error.message || 'The reset request could not be completed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMigrationRequest = async (e) => {
    e.preventDefault();
    setMigrationError('');
    setMigrationSuccess('');

    const cleanEmail = email.trim().toLowerCase();
    if (!migrationName.trim()) {
      setMigrationError('Please enter your full name as registered with the office.');
      return;
    }
    if (migrationMobile.trim() && !/^[6-9]\d{9}$/.test(migrationMobile.replace(/\D/g, ''))) {
      setMigrationError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setMigrationSubmitting(true);
    try {
      const result = await authService.requestAccountMigration({
        email: cleanEmail,
        fullName: migrationName.trim(),
        mobile: migrationMobile.trim()
      });
      setMigrationSuccess(
        result?.status === 'already-requested'
          ? 'A migration request for this email is already open. The office will contact you after verifying your details.'
          : 'Migration request submitted. The office will verify your details and contact you — no password is changed until you confirm the reset yourself.'
      );
    } catch (error) {
      console.error('Migration request error:', error);
      if (error.code === 'ACCOUNT_EXISTS' || error.status === 409) {
        setMigrationError(
          'This email already has a working sign-in account. Please use Sign In or Reset Password instead.'
        );
        setNeedsMigration(false);
      } else if (error.code === 'VALIDATION_ERROR') {
        setMigrationError(error.message);
      } else if (error.code === 'NETWORK_ERROR') {
        setMigrationError('Network connection error. Please check your internet connection.');
      } else if (error.status === 503) {
        setMigrationError('The account service is temporarily unavailable. Please try again later.');
      } else {
        setMigrationError(error.message || 'The migration request could not be submitted. Please try again.');
      }
    } finally {
      setMigrationSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center space-y-3 mb-8">
        <Badge variant="cyan" className="mx-auto">Account Recovery</Badge>
        <h1 className="text-3xl font-extrabold text-white">Reset Password</h1>
        <p className="text-xs text-slate-400">Reset by email, or request migration for pre-upgrade accounts</p>
      </div>

      <Card className="border border-slate-800 bg-slate-900/90 p-8 space-y-6">
        {/* STATUS MESSAGES */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* RESET FORM */}
        <form onSubmit={handleResetRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Registered Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="e.g. student@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            icon={Send}
            disabled={isSubmitting || migrationSubmitting}
          >
            {isSubmitting ? 'Sending Reset Link...' : 'Send Password Reset Link'}
          </Button>
        </form>

        {/* ACCOUNT MIGRATION REQUEST (pre-upgrade accounts) */}
        {needsMigration && (
          <form onSubmit={handleMigrationRequest} className="space-y-4 pt-4 border-t border-slate-800">
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
              <span>
                Accounts created before the upgrade are migrated manually by the office. Submit your
                details below to open a migration request — your password is never reset and no
                account is created automatically.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Full Name *
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={migrationName}
                  onChange={(e) => setMigrationName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Mobile Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={migrationMobile}
                  onChange={(e) => setMigrationMobile(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {migrationError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{migrationError}</span>
              </div>
            )}
            {migrationSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{migrationSuccess}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="outline"
              size="md"
              className="w-full"
              icon={Send}
              disabled={migrationSubmitting}
            >
              {migrationSubmitting ? 'Submitting Request...' : 'Request Account Migration'}
            </Button>
          </form>
        )}

        <div className="space-y-4 text-sm text-slate-300 pt-2">
          <a
            href="tel:+919422295496"
            className="flex items-center gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 transition-colors group"
          >
            <Phone className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Helpline</div>
              <div className="text-white font-bold group-hover:text-blue-400">+91 9422295496</div>
            </div>
          </a>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <MapPin className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Visit Office</div>
              <div className="text-white text-sm">Ultimate Computer — during office hours, bring your photo ID</div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 text-center">
          <Button
            variant="outline"
            size="sm"
            icon={ArrowLeft}
            onClick={() => setActivePage('login')}
          >
            Return to Login
          </Button>
        </div>
      </Card>
    </div>
  );
};
