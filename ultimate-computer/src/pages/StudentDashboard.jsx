import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeUserApplications } from '../services/admissionService';
import { updateUserProfileData, updateUserPassword } from '../services/userService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  UserCheck,
  BookOpen,
  LogOut,
  ShieldCheck,
  Mail,
  Phone,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  RefreshCw,
  MessageCircle,
  Key,
  User,
  Eye,
  ArrowRight,
  Sparkles,
  Edit3,
  Save,
  DollarSign,
  HelpCircle,
  Calendar,
  MapPin,
  GraduationCap
} from 'lucide-react';

export const StudentDashboard = ({ setActivePage }) => {
  const { currentUser, userProfile, role, logout, profileLoading, profileError } = useAuth();

  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selectedAppModal, setSelectedAppModal] = useState(null);

  // Edit Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Change Password States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [passSubmitting, setPassSubmitting] = useState(false);

  // Notification Banner
  const [notificationMsg, setNotificationMsg] = useState('');

  useEffect(() => {
    const uid = currentUser?.uid || userProfile?.uid;
    const email = currentUser?.email || userProfile?.email;
    console.log('[StudentDashboard] Subscribing to applications for UID:', uid, 'Email:', email);

    setLoadingApps(true);
    const unsubscribe = subscribeUserApplications(uid, email, (data) => {
      console.log('[StudentDashboard] Real-time applications update:', data?.length, data);
      setApplications(data || []);
      setLoadingApps(false);
    });

    if (userProfile) {
      setEditName(userProfile.fullName || '');
      setEditMobile(userProfile.mobile || '');
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentUser, userProfile]);

  const handleLogout = async () => {
    await logout();
    setActivePage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProfile = async () => {
    const uid = currentUser?.uid || userProfile?.uid;
    if (!uid) return;

    if (!editName.trim()) {
      alert("Full name cannot be empty.");
      return;
    }

    setProfileSaving(true);
    try {
      await updateUserProfileData(uid, {
        fullName: editName.trim(),
        mobile: editMobile.trim()
      });
      userProfile.fullName = editName.trim();
      userProfile.mobile = editMobile.trim();
      setIsEditingProfile(false);
      setNotificationMsg("Profile information updated successfully.");
      setTimeout(() => setNotificationMsg(''), 4000);
    } catch (err) {
      alert("Failed to update profile: " + err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!newPass || newPass.length < 6) {
      setPassError("New password must be at least 6 characters long.");
      return;
    }

    if (newPass !== confirmPass) {
      setPassError("New passwords do not match.");
      return;
    }

    setPassSubmitting(true);
    try {
      if (!currentPass) {
        setPassError("Enter your current password to verify the change.");
        return;
      }
      await updateUserPassword(newPass, currentPass);
      setPassSuccess("Password updated successfully.");
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setShowPasswordModal(false), 2000);
    } catch (err) {
      console.error("Password update error:", err);
      if (err.code === 'WRONG_CURRENT_PASSWORD' || err.code === 'INVALID_CREDENTIALS' || err.status === 401) {
        setPassError("Current password is incorrect.");
      } else if (err.code === 'RECENT_LOGIN_REQUIRED') {
        setPassError("For security, please sign out and sign in again, then retry.");
      } else if (err.code === 'TOO_MANY_REQUESTS') {
        setPassError("Too many attempts. Please wait a minute and try again.");
      } else {
        setPassError(err.message || "Failed to update password. Try re-authenticating.");
      }
    } finally {
      setPassSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-bold text-xs">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-xs">
            <Clock className="w-3.5 h-3.5" /> Under Review (Pending)
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* NOTIFICATION BANNER */}
      {notificationMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* 2. DASHBOARD HEADER */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-blue-500/30 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <Badge variant="emerald" className="w-fit mx-auto md:mx-0">
            <UserCheck className="w-3.5 h-3.5" /> Authenticated Student Session
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Welcome back, {userProfile?.fullName || currentUser?.displayName || 'Student'}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Ultimate Computer Student Portal • Dedicated Learning Workspace
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={Key}
            onClick={() => setShowPasswordModal(true)}
          >
            Change Password
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={LogOut}
            onClick={handleLogout}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* 3. QUICK ACTION CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Browse Courses', page: 'courses', icon: BookOpen, color: 'text-blue-400' },
          { label: 'Apply for Admission', page: 'admission', icon: Plus, color: 'text-emerald-400' },
          { label: 'My Applications', page: 'applications-scroll', icon: FileText, color: 'text-amber-400' },
          { label: 'Fee Structure', page: 'fee-structure', icon: DollarSign, color: 'text-cyan-400' },
          { label: 'Contact Helpline', page: 'contact', icon: Phone, color: 'text-purple-400' },
        ].map((item, idx) => {
          const IconComponent = item.icon;
          return (
            <button
              key={idx}
              onClick={() => {
                if (item.page === 'applications-scroll') {
                  const el = document.getElementById('applications-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                } else {
                  setActivePage(item.page);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="glass-panel p-4 rounded-2xl border border-slate-800 hover:border-blue-500/40 transition-all text-center flex flex-col items-center justify-center gap-2 group"
            >
              <div className={`p-2.5 rounded-xl bg-slate-900 border border-slate-800 ${item.color} group-hover:scale-110 transition-transform`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* MAIN GRID WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 10. STUDENT PROFILE SECTION (Col 4) */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg">
                  {(userProfile?.fullName || 'S')[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{userProfile?.fullName || 'Student User'}</h3>
                  <span className="text-[11px] text-blue-400 font-semibold uppercase tracking-wider">
                    Role: {role === 'admin' ? 'Admin' : 'Student'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Edit Profile Info"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>

            {profileLoading ? (
              /* REAL PROFILE IS BEING FETCHED FROM FIRESTORE VIA THE API */
              <div className="py-8 text-center space-y-3">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading your student profile...</p>
              </div>
            ) : profileError ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                {profileError}
              </div>
            ) : isEditingProfile ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Full Name:</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Mobile Number:</label>
                  <input
                    type="tel"
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="primary" size="sm" icon={Save} onClick={handleSaveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingProfile(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-blue-400" /> Email:</span>
                  <span className="font-semibold text-slate-200 truncate max-w-[140px]">{userProfile?.email || currentUser?.email}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-cyan-400" /> Mobile:</span>
                  <span className="font-semibold text-slate-200">{userProfile?.mobile || 'Not Specified'}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-amber-400" /> Course:</span>
                  <span className="font-semibold text-slate-200 text-right max-w-[150px] truncate">
                    {userProfile?.course || 'Not Selected'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-purple-400" /> Registered:</span>
                  <span className="font-semibold text-slate-200">
                    {userProfile?.createdAt
                      ? new Date(userProfile.createdAt).toLocaleDateString()
                      : '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Role Security:</span>
                  <span className="font-semibold text-emerald-400">Verified Student</span>
                </div>
              </div>
            )}
          </Card>

          {/* 12. HELPLINE CONTACT CARD */}
          <div className="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-400" /> Need Help With Your Admission?
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Call our admissions office directly at <strong className="text-blue-400 font-bold">+91 9422295496</strong> or chat with us on WhatsApp.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <a
                href="tel:+919422295496"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors"
              >
                <Phone className="w-3.5 h-3.5" /> Call Now
              </a>
              <a
                href="https://wa.me/919422295496?text=Hello%20Ultimate%20Computer,%20I%20have%20an%20admission%20query."
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* 4 & 9. MY APPLICATIONS SECTION (Col 8) */}
        <div id="applications-section" className="lg:col-span-8 space-y-6">
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" /> My Applications ({applications.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setLoadingApps(true); setTimeout(() => setLoadingApps(false), 800); }}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title="Refresh Applications"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingApps ? 'animate-spin' : ''}`} />
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    setActivePage('admission');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Apply for Admission
                </Button>
              </div>
            </div>

            {/* Loading State */}
            {loadingApps ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading your applications from database...</p>
              </div>
            ) : applications.length > 0 ? (
              /* REAL APPLICATIONS LIST */
              <div className="space-y-6">
                {applications.map((app) => (
                  <div
                    key={app.id || app.applicationId}
                    className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="text-xs font-mono text-amber-400 font-bold block">
                          Application ID: {app.applicationId}
                        </span>
                        <h4 className="text-lg font-bold text-white mt-0.5">{app.courseName}</h4>
                      </div>
                      <div>{getStatusBadge(app.status)}</div>
                    </div>

                    {/* 5. VISUAL STATUS TIMELINE TRACKER */}
                    <div className="py-2">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Application Progress Tracker:</div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs relative">
                        {/* Connecting Line */}
                        <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-800 z-0" />

                        {/* Step 1: Submitted */}
                        <div className="relative z-10 flex flex-col items-center gap-1.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-xs shadow-md">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-slate-200">1. Submitted</span>
                          <span className="text-[10px] text-slate-500">
                            {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'Recorded'}
                          </span>
                        </div>

                        {/* Step 2: Under Review */}
                        <div className="relative z-10 flex flex-col items-center gap-1.5">
                          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs shadow-md ${
                            app.status === 'Approved' || app.status === 'Rejected'
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-amber-500 text-slate-950 animate-pulse'
                          }`}>
                            <Clock className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-slate-200">2. Under Review</span>
                          <span className="text-[10px] text-slate-500">Faculty Review</span>
                        </div>

                        {/* Step 3: Final Decision */}
                        <div className="relative z-10 flex flex-col items-center gap-1.5">
                          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs shadow-md ${
                            app.status === 'Approved' ? 'bg-emerald-500 text-slate-950' :
                            app.status === 'Rejected' ? 'bg-red-500 text-white' :
                            'bg-slate-800 text-slate-500'
                          }`}>
                            {app.status === 'Approved' ? <CheckCircle2 className="w-4 h-4" /> :
                             app.status === 'Rejected' ? <XCircle className="w-4 h-4" /> : '3'}
                          </div>
                          <span className="font-bold text-slate-200">3. Decision</span>
                          <span className="text-[10px] text-slate-500">{app.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Summary Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block">Fee Configuration:</span>
                        <span className="text-slate-200 font-semibold">{app.totalFee}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Preferred Contact:</span>
                        <span className="text-slate-200 font-semibold">{app.preferredContactMethod || 'Phone'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">City / Location:</span>
                        <span className="text-slate-200 font-semibold">{app.city || 'N/A'}</span>
                      </div>
                    </div>

                    {/* 6. READ-ONLY ADMIN REMARKS */}
                    {app.adminRemarks && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
                        <strong className="block font-bold text-amber-400 uppercase tracking-wider text-[10px]">
                          Official Admin Remarks:
                        </strong>
                        <p className="leading-relaxed text-slate-200">{app.adminRemarks}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 flex items-center justify-between">
                      <a
                        href={`https://wa.me/919422295496?text=Hello%20Ultimate%20Computer,%20I%20am%20checking%20status%20for%20my%20application%20(${app.applicationId}).`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Inquire via WhatsApp
                      </a>

                      {/* 7. VIEW FULL APPLICATION MODAL BUTTON */}
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Eye}
                        onClick={() => setSelectedAppModal(app)}
                      >
                        View Full Application
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 8. NO APPLICATION STATE (EMPTY STATE) */
              <div className="py-12 text-center space-y-4">
                <FileText className="w-12 h-12 text-slate-600 mx-auto" />
                <h4 className="text-lg font-bold text-slate-300">You haven't submitted an admission application yet.</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Choose a course from our certified computer programs and submit your online enrolment.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={BookOpen}
                    onClick={() => {
                      setActivePage('courses');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Explore Courses
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                      setActivePage('admission');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Apply for Admission
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODALS SECTION */}
      {/* ============================================================ */}

      {/* 7. VIEW FULL APPLICATION DETAILS MODAL */}
      <Modal
        isOpen={Boolean(selectedAppModal)}
        onClose={() => setSelectedAppModal(null)}
        title={`Application Details - ${selectedAppModal?.applicationId || ''}`}
        maxWidth="max-w-3xl"
      >
        {selectedAppModal && (
          <div className="space-y-6 text-xs text-slate-300">
            {/* Header Badge */}
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Application ID</span>
                <span className="font-mono text-base font-bold text-amber-400">{selectedAppModal.applicationId}</span>
              </div>
              <div>
                {getStatusBadge(selectedAppModal.status)}
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Personal Information</h4>
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950/80 rounded-xl border border-slate-800">
                <div><span className="text-slate-500">Full Name:</span> <strong className="text-white block text-sm">{selectedAppModal.fullName}</strong></div>
                <div><span className="text-slate-500">Email Address:</span> <strong className="text-white block text-sm">{selectedAppModal.email}</strong></div>
                <div><span className="text-slate-500">Mobile Number:</span> <strong className="text-blue-400 block text-sm">{selectedAppModal.mobile}</strong></div>
                <div><span className="text-slate-500">Date of Birth:</span> <strong className="text-white block text-sm">{selectedAppModal.dateOfBirth || 'N/A'}</strong></div>
                <div><span className="text-slate-500">Gender:</span> <strong className="text-white block">{selectedAppModal.gender}</strong></div>
                <div><span className="text-slate-500">City / Location:</span> <strong className="text-white block">{selectedAppModal.city}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Full Address:</span> <strong className="text-white block">{selectedAppModal.address}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Education:</span> <strong className="text-white block">{selectedAppModal.education}</strong></div>
              </div>
            </div>

            {/* Course Information */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Course & Fee Information</h4>
              <div className="grid grid-cols-2 gap-3 p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                <div><span className="text-slate-400">Course Name:</span> <strong className="text-white block text-sm">{selectedAppModal.courseName}</strong></div>
                <div><span className="text-slate-400">Total Fee:</span> <strong className="text-amber-400 block text-sm">{selectedAppModal.totalFee}</strong></div>
                <div><span className="text-slate-400">Course Fee:</span> <strong className="text-slate-200 block">{selectedAppModal.courseFee}</strong></div>
                <div><span className="text-slate-400">Registration Fee:</span> <strong className="text-slate-200 block">{selectedAppModal.registrationFee}</strong></div>
              </div>
            </div>

            {/* Admin Remarks */}
            {selectedAppModal.adminRemarks && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <strong className="block font-bold mb-0.5 uppercase tracking-wider text-[10px]">Admin Remarks (Read Only):</strong>
                {selectedAppModal.adminRemarks}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setSelectedAppModal(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 11. CHANGE PASSWORD MODAL */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Change Account Password"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs">
          {passError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
              {passError}
            </div>
          )}
          {passSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
              {passSuccess}
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Current Password * (required to verify)</label>
            <input
              type="password"
              required
              placeholder="Enter current password"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">New Password (Min 6 Characters) *</label>
            <input
              type="password"
              required
              placeholder="Enter new password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              placeholder="Re-enter new password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={passSubmitting}>
              {passSubmitting ? "Updating Password..." : "Update Password"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
