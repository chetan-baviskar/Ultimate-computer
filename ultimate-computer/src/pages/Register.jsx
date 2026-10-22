import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { User, Mail, Phone, Lock, Eye, EyeOff, UserPlus, AlertCircle, ArrowLeft, CheckCircle2, BookOpen } from 'lucide-react';

export const Register = ({ setActivePage }) => {
  const { registerStudent } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobile: '',
    course: 'ADCA (Advanced Diploma in Computer Applications)',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full Name is required';
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email.trim())) {
      newErrors.email = 'Enter a valid email address';
    }

    if (formData.mobile.trim() && !/^[6-9]\d{9}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = 'Enter a valid 10-digit Indian mobile number';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setSuccessMsg('');
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await registerStudent({
        email: formData.email.trim(),
        password: formData.password,
        fullName: formData.fullName.trim(),
        mobile: formData.mobile.trim(),
        course: formData.course
      });
      setSuccessMsg('Student account registered successfully! Redirecting to Student Login...');
      setTimeout(() => {
        setActivePage('login');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1500);
    } catch (error) {
      console.error("Registration error:", error);
      const code = error.code || '';
      const message = typeof error.message === 'string' ? error.message : '';

      if (code === 'EMAIL_EXISTS' || error.status === 409) {
        setServerError('This email address is already registered. Please sign in instead.');
      } else if (code === 'WEAK_PASSWORD') {
        setServerError('Password should be at least 6 characters long.');
      } else if (code === 'PROFILE_WRITE_FAILED') {
        setServerError(
          'Your sign-in account was created but your student profile could not be saved. Please press "Create Student Account" again — it will complete your profile, not duplicate it.'
        );
      } else if (code === 'TOO_MANY_REQUESTS') {
        setServerError('Too many attempts. Please wait a minute and try again.');
      } else if (code === 'INVALID_EMAIL' || code === 'EMAIL_REQUIRED' || error.status === 400) {
        setServerError(message || 'Please enter a valid email address format.');
      } else if (code === 'NETWORK_ERROR') {
        setServerError('Network connection error. Please check your internet connection.');
      } else if (code === 'DATA_LAYER_UNAVAILABLE' || error.status === 503) {
        setServerError(
          'Registration is temporarily unavailable while the account service is being upgraded. Please try again later.'
        );
      } else if (error.status >= 500) {
        setServerError('Registration service is temporarily unavailable. Please try again shortly.');
      } else {
        setServerError(message || 'Failed to register account. Please check your network connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center space-y-3 mb-8">
        <Badge variant="cyan" className="mx-auto">New Student Registration</Badge>
        <h1 className="text-3xl font-extrabold text-white">Create Student Account</h1>
        <p className="text-xs text-slate-400">Sign up to access course syllabus, application status, and learning materials</p>
      </div>

      <Card className="border border-slate-800 bg-slate-900/90 p-6 sm:p-8 space-y-6">
        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Full Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className={`w-full bg-slate-950 border ${errors.fullName ? 'border-red-500' : 'border-slate-800'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500`}
              />
            </div>
            {errors.fullName && <p className="text-xs text-red-400 mt-1">{errors.fullName}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="e.g. student@gmail.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`w-full bg-slate-950 border ${errors.email ? 'border-red-500' : 'border-slate-800'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500`}
              />
            </div>
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Mobile Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className={`w-full bg-slate-950 border ${errors.mobile ? 'border-red-500' : 'border-slate-800'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500`}
              />
            </div>
            {errors.mobile && <p className="text-xs text-red-400 mt-1">{errors.mobile}</p>}
          </div>

          {/* Course / Branch */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Course / Branch Selection *
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
              >
                <option value="ADCA (Advanced Diploma in Computer Applications)">ADCA (Advanced Diploma in Computer Applications)</option>
                <option value="DCA (Diploma in Computer Applications)">DCA (Diploma in Computer Applications)</option>
                <option value="Tally Prime with GST Certification">Tally Prime with GST Certification</option>
                <option value="Python Data Science & AI">Python Data Science & AI</option>
                <option value="Full Stack Web Development">Full Stack Web Development</option>
                <option value="C & C++ Programming Fundamentals">C & C++ Programming Fundamentals</option>
                <option value="Computer Hardware & Networking">Computer Hardware & Networking</option>
                <option value="Graphic Designing & DTP">Graphic Designing & DTP</option>
                <option value="Office Automation & CCC">Office Automation & CCC</option>
              </select>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Password (Min 6 Characters) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Create secure password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full bg-slate-950 border ${errors.password ? 'border-red-500' : 'border-slate-800'} rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Confirm Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full bg-slate-950 border ${errors.confirmPassword ? 'border-red-500' : 'border-slate-800'} rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500`}
              />
            </div>
            {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              icon={UserPlus}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating Account..." : "Create Student Account"}
            </Button>
          </div>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400">
            Already registered?{' '}
            <button
              onClick={() => setActivePage('login')}
              className="text-blue-400 font-semibold hover:underline"
            >
              Sign In to Portal
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
};
