import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeApplications,
  subscribeStudentUsers,
  updateApplicationStatus,
  deleteApplication
} from '../services/admissionService';
import {
  subscribeEnquiries,
  markEnquiryRead,
  deleteEnquiry
} from '../services/enquiryService';
import {
  subscribeCourses,
  addCourse,
  updateCourse,
  deleteCourse
} from '../services/courseService';
import { coursesData } from '../data/coursesData';
import { api } from '../config/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  FileText,
  Users,
  BookOpen,
  DollarSign,
  MessageSquare,
  Settings,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Trash2,
  Edit3,
  Save,
  Menu,
  X,
  Phone,
  Mail,
  Calendar,
  MapPin,
  GraduationCap,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Plus
} from 'lucide-react';

export const AdminDashboard = ({ setActivePage }) => {
  const { currentUser, userProfile, logout } = useAuth();

  // Active Admin Sidebar Tab
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'applications' | 'students' | 'courses' | 'fees' | 'enquiries' | 'settings'
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Real-time Data States
  const [applications, setApplications] = useState([]);
  const [students, setStudents] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState('');

  // Honest per-module failure tracking: when one of the live panels cannot
  // reach the API, the dashboard says so instead of showing empty lists as if
  // there were no records.
  const [panelErrors, setPanelErrors] = useState({ applications: '', students: '', enquiries: '' });

  // Honest database status: probed once on mount from the API's own health
  // endpoint, so the header never claims a connection that does not exist.
  const [dbStatus, setDbStatus] = useState('checking'); // 'checking' | 'connected' | 'unavailable'

  // Course Management Modals & Form State
  const emptyCourseForm = {
    courseName: '',
    shortDescription: '',
    detailedDescription: '',
    duration: '',
    totalFee: '',
    fee: '',
    registrationFee: '',
    eligibility: '',
    imageUrl: '',
    category: 'Certified Program',
    status: 'active'
  };

  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [courseFormData, setCourseFormData] = useState(emptyCourseForm);
  const [courseFormErrors, setCourseFormErrors] = useState({});
  const [isCourseSubmitting, setIsCourseSubmitting] = useState(false);
  const [courseModalError, setCourseModalError] = useState('');
  const [courseStatusFilter, setCourseStatusFilter] = useState('All');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [courseFilter, setCourseFilter] = useState('All');
  const [dateSort, setDateSort] = useState('newest'); // 'newest' | 'oldest'

  // Modals & Active Selections
  const [viewAppModal, setViewAppModal] = useState(null);
  const [approveConfirmModal, setApproveConfirmModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [viewEnquiryModal, setViewEnquiryModal] = useState(null);

  // Editable Fee Configuration State
  const [editingFeeCourseId, setEditingFeeCourseId] = useState(null);
  const [tempFeeData, setTempFeeData] = useState({ fee: '', registrationFee: '', totalFee: '' });

  // Notifications Banner
  const [notification, setNotification] = useState('');

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  // Real-time Data Subscriptions
  useEffect(() => {
    const markPanelError = (key) => (err) =>
      setPanelErrors((prev) => ({
        ...prev,
        [key]: err?.message || 'The API did not answer. Live data may be out of date.'
      }));
    const clearPanelError = (key) => () =>
      setPanelErrors((prev) => ({ ...prev, [key]: '' }));

    const unsubApps = subscribeApplications(
      (data) => {
        setApplications(data);
        clearPanelError('applications')();
      },
      markPanelError('applications')
    );
    const unsubStudents = subscribeStudentUsers(
      (data) => {
        setStudents(data);
        clearPanelError('students')();
      },
      markPanelError('students')
    );
    const unsubEnquiries = subscribeEnquiries(
      (data) => {
        setEnquiries(data);
        clearPanelError('enquiries')();
      },
      markPanelError('enquiries')
    );
    const unsubCourses = subscribeCourses(
      (data) => {
        setCourses(data);
        setCoursesLoading(false);
        setCoursesError('');
      },
      (err) => {
        setCoursesError(err.message || 'Failed to sync courses with the database.');
        setCoursesLoading(false);
      }
    );

    return () => {
      if (typeof unsubApps === 'function') unsubApps();
      if (typeof unsubStudents === 'function') unsubStudents();
      if (typeof unsubEnquiries === 'function') unsubEnquiries();
      if (typeof unsubCourses === 'function') unsubCourses();
    };
  }, []);

  // Database status probe (runs once): the badge in the header reports what
  // the API itself says about Cloud Firestore, not a hard-coded message.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/health/firestore')
      .then((result) => {
        if (!cancelled) setDbStatus(result?.status === 'ok' ? 'connected' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setDbStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setActivePage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Real Statistics Calculations
  const stats = {
    totalApps: applications.length,
    pendingApps: applications.filter(a => a.status === 'Pending').length,
    approvedApps: applications.filter(a => a.status === 'Approved').length,
    rejectedApps: applications.filter(a => a.status === 'Rejected').length,
    totalStudents: students.length,
    unreadEnquiries: enquiries.filter(e => e.status === 'Unread').length,
  };

  // Application Actions
  const handleApproveConfirm = async () => {
    if (!approveConfirmModal) return;
    try {
      await updateApplicationStatus(approveConfirmModal.id || approveConfirmModal.applicationId, 'Approved', approveConfirmModal.adminRemarks || 'Approved by Admin');
      showNotification(`Application ${approveConfirmModal.applicationId} approved successfully.`);
      setApproveConfirmModal(null);
    } catch (err) {
      alert("Error approving application: " + err.message);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal) return;
    if (!rejectRemark.trim()) {
      alert("Please enter a reason or remark for rejecting this application.");
      return;
    }
    try {
      await updateApplicationStatus(rejectModal.id || rejectModal.applicationId, 'Rejected', rejectRemark);
      showNotification(`Application ${rejectModal.applicationId} rejected with remark.`);
      setRejectModal(null);
      setRejectRemark('');
    } catch (err) {
      alert("Error rejecting application: " + err.message);
    }
  };

  // Filtered & Sorted Applications
  const filteredApplications = applications
    .filter(app => {
      const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
      const matchesCourse = courseFilter === 'All' || app.courseId === courseFilter || app.courseName === courseFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (app.fullName && app.fullName.toLowerCase().includes(q)) ||
        (app.email && app.email.toLowerCase().includes(q)) ||
        (app.mobile && app.mobile.includes(q)) ||
        (app.applicationId && app.applicationId.toLowerCase().includes(q)) ||
        (app.courseName && app.courseName.toLowerCase().includes(q));
      return matchesStatus && matchesCourse && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return dateSort === 'newest' ? timeB - timeA : timeA - timeB;
    });

  // Filtered Students List
  const filteredStudents = students.filter(std => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      (std.fullName && std.fullName.toLowerCase().includes(q)) ||
      (std.email && std.email.toLowerCase().includes(q)) ||
      (std.mobile && std.mobile.includes(q))
    );
  });

  // Filtered Enquiries List
  const filteredEnquiries = enquiries.filter(enq => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      (enq.name && enq.name.toLowerCase().includes(q)) ||
      (enq.email && enq.email.toLowerCase().includes(q)) ||
      (enq.phone && enq.phone.includes(q)) ||
      (enq.subject && enq.subject.toLowerCase().includes(q))
    );
  });

  // Course Management Handlers
  const openAddCourseModal = () => {
    setEditingCourse(null);
    setCourseFormData(emptyCourseForm);
    setCourseFormErrors({});
    setCourseModalError('');
    setIsCourseModalOpen(true);
  };

  const openEditCourseModal = (c) => {
    setEditingCourse(c);
    setCourseFormData({
      courseName: c.courseName || c.title || '',
      shortDescription: c.shortDescription || '',
      detailedDescription: c.detailedDescription || c.shortDescription || '',
      duration: c.duration || '',
      totalFee: c.totalFee || c.fee || '',
      fee: c.fee || '',
      registrationFee: c.registrationFee || '',
      eligibility: c.eligibility || '',
      imageUrl: c.imageUrl || c.image || '',
      category: c.category || 'Certified Program',
      status: c.status || 'active'
    });
    setCourseFormErrors({});
    setCourseModalError('');
    setIsCourseModalOpen(true);
  };

  const validateCourseForm = () => {
    const errs = {};
    if (!courseFormData.courseName.trim()) errs.courseName = "Course name is required.";
    if (!courseFormData.shortDescription.trim()) errs.shortDescription = "Short description is required.";
    if (!courseFormData.duration.trim()) errs.duration = "Duration is required.";
    if (!courseFormData.totalFee.trim() && !courseFormData.fee.trim()) errs.totalFee = "Fee amount is required.";
    if (!courseFormData.eligibility.trim()) errs.eligibility = "Eligibility is required.";
    setCourseFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    setCourseModalError('');
    if (!validateCourseForm()) return;

    setIsCourseSubmitting(true);
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, courseFormData);
        showNotification(`Course "${courseFormData.courseName}" updated successfully!`);
      } else {
        await addCourse(courseFormData);
        showNotification(`New course "${courseFormData.courseName}" added successfully!`);
      }
      setIsCourseModalOpen(false);
      setEditingCourse(null);
      setCourseFormData(emptyCourseForm);
    } catch (err) {
      console.error("Save course error:", err);
      setCourseModalError(err.message || "Failed to save course to the database.");
    } finally {
      setIsCourseSubmitting(false);
    }
  };

  const handleDeleteCourseConfirm = async () => {
    if (!courseToDelete) return;
    try {
      await deleteCourse(courseToDelete.id);
      showNotification(`Course "${courseToDelete.courseName}" deleted successfully!`);
      setCourseToDelete(null);
    } catch (err) {
      console.error("Delete course error:", err);
      alert("Error deleting course: " + err.message);
    }
  };

  // Fee Management Save Handler (Syncs with the database via updateCourse)
  const handleSaveFeeConfig = async (courseId) => {
    try {
      await updateCourse(courseId, {
        fee: tempFeeData.fee,
        registrationFee: tempFeeData.registrationFee,
        totalFee: tempFeeData.totalFee
      });
      setEditingFeeCourseId(null);
      showNotification("Course fee configuration updated in the database.");
    } catch (err) {
      alert("Error updating fee: " + err.message);
    }
  };

  // Filtered Courses for Admin View
  const filteredCourses = courses.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (c.courseName && c.courseName.toLowerCase().includes(q)) || (c.shortDescription && c.shortDescription.toLowerCase().includes(q));
    const matchesStatus = courseStatusFilter === 'All' || c.status === courseStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const navMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'applications', label: 'Applications', icon: FileText, badge: stats.pendingApps > 0 ? stats.pendingApps : null },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'course-management', label: 'Course Management', icon: BookOpen },
    { id: 'fees', label: 'Fee Management', icon: DollarSign },
    { id: 'enquiries', label: 'Enquiries', icon: MessageSquare, badge: stats.unreadEnquiries > 0 ? stats.unreadEnquiries : null },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Live modules that failed to load for the ACTIVE tab. These are reported in
  // a banner so an API failure is never disguised as "no records found".
  const PANEL_LABELS = {
    applications: 'admission applications',
    students: 'student profiles',
    enquiries: 'contact enquiries'
  };
  const failedPanelKeys = (() => {
    const relevant =
      activeTab === 'dashboard'
        ? ['applications', 'students', 'enquiries']
        : ['applications', 'students', 'enquiries'].includes(activeTab)
          ? [activeTab]
          : [];
    return relevant.filter((key) => panelErrors[key]);
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* MOBILE DRAWER OVERLAY */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-md z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-slate-900/95 border-r border-slate-800 p-5 flex flex-col justify-between transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-extrabold text-white tracking-tight">ADMIN PORTAL</span>
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Ultimate Computer</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu Links */}
          <nav className="space-y-1.5">
            {navMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom Profile & Logout */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold">
              A
            </div>
            <div className="truncate">
              <div className="font-bold text-white truncate">{userProfile?.fullName || 'Administrator'}</div>
              <div className="text-[10px] text-slate-500 truncate">{currentUser?.email}</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out Admin
          </button>
        </div>
      </aside>

      {/* MAIN WORKSPACE AREA */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 overflow-x-hidden">
        {/* TOP HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-300 hover:text-white rounded-xl bg-slate-900 border border-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white capitalize">
                {activeTab.replace('-', ' ')}
              </h1>
              <p className="text-xs text-slate-400">
                Ultimate Computer Administration Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {dbStatus === 'connected' ? (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Database Connected
              </span>
            ) : (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {dbStatus === 'checking' ? 'Checking Database...' : 'Database Unavailable'}
              </span>
            )}
          </div>
        </div>

        {/* NOTIFICATION BANNER */}
        {notification && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        {/* HONEST DATA-FAILURE BANNER (a module that cannot be reached says so) */}
        {failedPanelKeys.length > 0 && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Live data could not be loaded for{' '}
              {failedPanelKeys.map((key) => PANEL_LABELS[key]).join(', ')}:{' '}
              {panelErrors[failedPanelKeys[0]]} Figures and lists for these modules
              may be incomplete or out of date until the connection recovers.
            </span>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: DASHBOARD OVERVIEW VIEW */}
        {/* ============================================================ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Real Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="border border-slate-800 bg-slate-900/90 p-5 text-center">
                <div className="text-3xl font-black text-white">{stats.totalApps}</div>
                <div className="text-xs text-slate-400 mt-1">Total Applications</div>
              </Card>

              <Card className="border border-slate-800 bg-slate-900/90 p-5 text-center">
                <div className="text-3xl font-black text-amber-400">{stats.pendingApps}</div>
                <div className="text-xs text-slate-400 mt-1">Pending Review</div>
              </Card>

              <Card className="border border-slate-800 bg-slate-900/90 p-5 text-center">
                <div className="text-3xl font-black text-emerald-400">{stats.approvedApps}</div>
                <div className="text-xs text-slate-400 mt-1">Approved</div>
              </Card>

              <Card className="border border-slate-800 bg-slate-900/90 p-5 text-center">
                <div className="text-3xl font-black text-red-400">{stats.rejectedApps}</div>
                <div className="text-xs text-slate-400 mt-1">Rejected</div>
              </Card>

              <Card className="border border-slate-800 bg-slate-900/90 p-5 text-center col-span-2 lg:col-span-1">
                <div className="text-3xl font-black text-cyan-400">{stats.totalStudents}</div>
                <div className="text-xs text-slate-400 mt-1">Registered Students</div>
              </Card>
            </div>

            {/* Quick Actions Bar */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-slate-300">
                <strong className="text-white block font-bold text-sm mb-0.5">Quick Actions</strong>
                Review submitted student applications, modify fee configurations, or reply to contact enquiries.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" icon={FileText} onClick={() => setActiveTab('applications')}>
                  Manage Applications ({stats.pendingApps})
                </Button>
                <Button variant="secondary" size="sm" icon={MessageSquare} onClick={() => setActiveTab('enquiries')}>
                  View Enquiries ({stats.unreadEnquiries})
                </Button>
              </div>
            </div>

            {/* Recent Applications Table */}
            <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" /> Recent Admission Applications
                </h3>
                <button
                  onClick={() => setActiveTab('applications')}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  View All ({stats.totalApps})
                </button>
              </div>

              {applications.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Application ID</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Course</th>
                        <th className="py-3 px-4">Submitted</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {applications.slice(0, 5).map(app => (
                        <tr key={app.id || app.applicationId} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono font-bold text-amber-400">{app.applicationId}</td>
                          <td className="py-3 px-4 font-bold text-white">{app.fullName}</td>
                          <td className="py-3 px-4 text-slate-300">{app.courseName}</td>
                          <td className="py-3 px-4 text-slate-400">{app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'Recent'}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              app.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              app.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setViewAppModal(app)}
                              className="p-1.5 text-blue-400 hover:bg-slate-800 rounded-lg"
                              title="View Application Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">No applications submitted yet.</div>
              )}
            </Card>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: APPLICATION MANAGEMENT VIEW */}
        {/* ============================================================ */}
        {activeTab === 'applications' && (
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-6">
            {/* Filter & Search Bar */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="relative w-full lg:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search name, ID, mobile, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>

                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="All">All Courses</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.courseName || c.title}</option>
                  ))}
                </select>

                <select
                  value={dateSort}
                  onChange={(e) => setDateSort(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>

            {/* Applications Data Table */}
            {filteredApplications.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">App ID</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Course</th>
                      <th className="py-3 px-4">Applied Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredApplications.map(app => (
                      <tr key={app.id || app.applicationId} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">{app.applicationId}</td>
                        <td className="py-3 px-4 font-bold text-white">{app.fullName}</td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{app.mobile}</div>
                          <div className="text-[10px] text-slate-500">{app.email}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-200">{app.courseName}</td>
                        <td className="py-3 px-4 text-slate-400">
                          {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'Recent'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            app.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            app.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {app.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setViewAppModal(app)}
                              className="p-1.5 text-blue-400 hover:bg-slate-800 rounded-lg"
                              title="View Full Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => setApproveConfirmModal(app)}
                              className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded-lg"
                              title="Approve Application"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => { setRejectModal(app); setRejectRemark(app.adminRemarks || ''); }}
                              className="p-1.5 text-red-400 hover:bg-slate-800 rounded-lg"
                              title="Reject Application"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                No applications match your search or filter criteria.
              </div>
            )}
          </Card>
        )}

        {/* ============================================================ */}
        {/* TAB 3: REGISTERED STUDENTS VIEW */}
        {/* ============================================================ */}
        {activeTab === 'students' && (
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" /> Registered Student Profiles ({students.length})
              </h3>
              <div className="relative w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {filteredStudents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Mobile</th>
                      <th className="py-3 px-4">Registered Date</th>
                      <th className="py-3 px-4">Applications</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredStudents.map(std => {
                      const studentApps = applications.filter(a => a.studentUid === std.uid || a.email === std.email);
                      return (
                        <tr key={std.id || std.uid} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-bold text-white">{std.fullName || 'Student'}</td>
                          <td className="py-3 px-4 text-slate-300">{std.email}</td>
                          <td className="py-3 px-4 text-slate-400">{std.mobile || 'N/A'}</td>
                          <td className="py-3 px-4 text-slate-400">
                            {std.createdAt ? new Date(std.createdAt).toLocaleDateString() : 'Registered'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-bold text-[10px]">
                              {studentApps.length} Submitted
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">No student profiles found.</div>
            )}
          </Card>
        )}

        {/* ============================================================ */}
        {/* TAB 4: COURSE MANAGEMENT VIEW */}
        {/* ============================================================ */}
        {(activeTab === 'course-management' || activeTab === 'courses') && (
          <div className="space-y-6">
            {/* Header Action Bar */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                  Course Management Directory ({courses.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Add, edit, or delete courses. Active courses sync dynamically to the public Courses & Admission pages.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                icon={Plus}
                onClick={openAddCourseModal}
              >
                Add New Course
              </Button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel p-4 rounded-xl border border-slate-800">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search courses by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                <span className="text-slate-400 font-semibold flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-amber-400" /> Status:
                </span>
                <select
                  value={courseStatusFilter}
                  onChange={(e) => setCourseStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {/* ERROR ALERT */}
            {coursesError && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{coursesError}</span>
              </div>
            )}

            {/* LOADING STATE */}
            {coursesLoading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-medium">Loading courses from database...</p>
              </div>
            ) : filteredCourses.length > 0 ? (
              /* COURSES DATA TABLE / CARDS */
              <Card className="border border-slate-800 bg-slate-900/90 p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Course Name</th>
                        <th className="py-3 px-4">Short Description</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Total Fee</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredCourses.map(c => (
                        <tr key={c.id} className="hover:bg-slate-800/40">
                          <td className="py-3.5 px-4 font-bold text-white max-w-[200px]">
                            {c.courseName || c.title}
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 max-w-[300px]">
                            <p className="line-clamp-2">{c.shortDescription}</p>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-200">
                            {c.duration}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-amber-400">
                            {c.totalFee || c.fee}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              c.status === 'active' || !c.status
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {c.status === 'active' || !c.status ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditCourseModal(c)}
                                className="p-1.5 text-blue-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 font-semibold text-[11px]"
                                title="Edit Course"
                              >
                                <Edit3 className="w-4 h-4" /> Edit
                              </button>

                              <button
                                onClick={() => setCourseToDelete(c)}
                                className="p-1.5 text-red-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 font-semibold text-[11px]"
                                title="Delete Course"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              /* EMPTY COURSE STATE */
              <Card className="border border-slate-800 bg-slate-900/90 p-12 text-center space-y-4">
                <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-white">No Courses Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No courses match your search or filter criteria. Click below to create your first course.
                </p>
                <Button variant="primary" icon={Plus} onClick={openAddCourseModal}>
                  Add New Course
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: FEE MANAGEMENT VIEW */}
        {/* ============================================================ */}
        {activeTab === 'fees' && (
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800">
              <h3 className="text-lg font-bold text-white">Course Fee Configuration</h3>
              <p className="text-xs text-slate-400">Update course fee, admission fee, and total fee placeholders across the portal</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {courses.map(course => {
                const isEditing = editingFeeCourseId === course.id;
                return (
                  <Card key={course.id} className="border border-slate-800 bg-slate-900/90 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold text-white">{course.courseName}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        course.status === 'active' || !course.status ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {course.status === 'active' || !course.status ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1">Course Fee:</label>
                          <input
                            type="text"
                            value={tempFeeData.fee}
                            onChange={(e) => setTempFeeData({ ...tempFeeData, fee: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">Registration Fee:</label>
                          <input
                            type="text"
                            value={tempFeeData.registrationFee}
                            onChange={(e) => setTempFeeData({ ...tempFeeData, registrationFee: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">Total Fee:</label>
                          <input
                            type="text"
                            value={tempFeeData.totalFee}
                            onChange={(e) => setTempFeeData({ ...tempFeeData, totalFee: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="primary" size="sm" icon={Save} onClick={() => handleSaveFeeConfig(course.id)}>
                            Save Config
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingFeeCourseId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-slate-500">Course Fee:</span>
                          <span className="font-bold text-slate-200">{course.fee}</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                          <span className="text-slate-500">Registration Fee:</span>
                          <span className="font-bold text-slate-200">{course.registrationFee}</span>
                        </div>
                        <div className="flex justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">
                          <span>Total Fee:</span>
                          <span>{course.totalFee}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Edit3}
                          onClick={() => {
                            setEditingFeeCourseId(course.id);
                            setTempFeeData({ fee: course.fee || '', registrationFee: course.registrationFee || '', totalFee: course.totalFee || '' });
                          }}
                          className="w-full"
                        >
                          Edit Fee Configuration
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: ENQUIRIES MANAGEMENT VIEW */}
        {/* ============================================================ */}
        {activeTab === 'enquiries' && (
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-400" /> Contact Form Enquiries ({enquiries.length})
              </h3>
              <div className="relative w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search enquiries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {filteredEnquiries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Submitted</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredEnquiries.map(enq => (
                      <tr key={enq.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-white">{enq.name}</td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{enq.phone}</div>
                          <div className="text-[10px] text-slate-500">{enq.email}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{enq.subject}</td>
                        <td className="py-3 px-4 text-slate-400">
                          {enq.createdAt ? new Date(enq.createdAt).toLocaleDateString() : 'Recent'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            enq.status === 'Read' ? 'bg-slate-800 text-slate-400' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {enq.status || 'Unread'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setViewEnquiryModal(enq);
                                if (enq.status !== 'Read') markEnquiryRead(enq.id);
                              }}
                              className="p-1.5 text-blue-400 hover:bg-slate-800 rounded-lg"
                              title="View Message"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={async () => {
                                if (confirm("Delete this enquiry?")) {
                                  await deleteEnquiry(enq.id);
                                  showNotification("Enquiry deleted.");
                                }
                              }}
                              className="p-1.5 text-red-400 hover:bg-slate-800 rounded-lg"
                              title="Delete Enquiry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">No contact form enquiries found.</div>
            )}
          </Card>
        )}

        {/* ============================================================ */}
        {/* TAB 7: SETTINGS VIEW */}
        {/* ============================================================ */}
        {activeTab === 'settings' && (
          <Card className="border border-slate-800 bg-slate-900/90 p-6 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-400" /> Admin System Settings
            </h3>
            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">Administrative User Email</div>
                  <div className="text-slate-500">{currentUser?.email}</div>
                </div>
                <Badge variant="amber">Admin Role Active</Badge>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">Database Security Enforcements</div>
                  <div className="text-slate-500">Roles are verified on the API (Firebase ID token + stored role) for users, courses, applications and enquiries</div>
                </div>
                <Badge variant="emerald">Enforced</Badge>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white">Database Connection</div>
                  <div className="text-slate-500">
                    {dbStatus === 'connected'
                      ? 'Cloud Firestore is answering live requests.'
                      : dbStatus === 'checking'
                        ? 'Checking the Cloud Firestore connection...'
                        : 'Cloud Firestore did not answer — data shown may be cached.'}
                  </div>
                </div>
                <Badge variant={dbStatus === 'connected' ? 'emerald' : 'amber'}>
                  {dbStatus === 'connected' ? 'Live' : dbStatus === 'checking' ? 'Checking' : 'Unavailable'}
                </Badge>
              </div>
            </div>
          </Card>
        )}
      </main>

      {/* ============================================================ */}
      {/* MODALS SECTION */}
      {/* ============================================================ */}

      {/* 1. APPLICATION DETAIL MODAL */}
      <Modal
        isOpen={Boolean(viewAppModal)}
        onClose={() => setViewAppModal(null)}
        title={`Application Details - ${viewAppModal?.applicationId || ''}`}
        maxWidth="max-w-3xl"
      >
        {viewAppModal && (
          <div className="space-y-6 text-xs text-slate-300">
            {/* Header Badge */}
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Application ID</span>
                <span className="font-mono text-base font-bold text-amber-400">{viewAppModal.applicationId}</span>
              </div>
              <div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  viewAppModal.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  viewAppModal.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  Status: {viewAppModal.status}
                </span>
              </div>
            </div>

            {/* Applicant Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Student Profile & Contact</h4>
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950/80 rounded-xl border border-slate-800">
                <div><span className="text-slate-500">Full Name:</span> <strong className="text-white block text-sm">{viewAppModal.fullName}</strong></div>
                <div><span className="text-slate-500">Email Address:</span> <strong className="text-white block text-sm">{viewAppModal.email}</strong></div>
                <div><span className="text-slate-500">Mobile Number:</span> <strong className="text-blue-400 block text-sm">{viewAppModal.mobile}</strong></div>
                <div><span className="text-slate-500">Date of Birth:</span> <strong className="text-white block text-sm">{viewAppModal.dateOfBirth || 'N/A'}</strong></div>
                <div><span className="text-slate-500">Gender:</span> <strong className="text-white block">{viewAppModal.gender}</strong></div>
                <div><span className="text-slate-500">City / Location:</span> <strong className="text-white block">{viewAppModal.city}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Full Address:</span> <strong className="text-white block">{viewAppModal.address}</strong></div>
              </div>
            </div>

            {/* Program & Fee Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Enrolled Course & Fee Configuration</h4>
              <div className="grid grid-cols-2 gap-3 p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                <div><span className="text-slate-400">Course Name:</span> <strong className="text-white block text-sm">{viewAppModal.courseName}</strong></div>
                <div><span className="text-slate-400">Total Fee:</span> <strong className="text-amber-400 block text-sm">{viewAppModal.totalFee}</strong></div>
                <div><span className="text-slate-400">Course Fee:</span> <strong className="text-slate-200 block">{viewAppModal.courseFee}</strong></div>
                <div><span className="text-slate-400">Registration Fee:</span> <strong className="text-slate-200 block">{viewAppModal.registrationFee}</strong></div>
                <div><span className="text-slate-400">Qualification:</span> <strong className="text-slate-200 block">{viewAppModal.education}</strong></div>
                <div><span className="text-slate-400">Computer Knowledge:</span> <strong className="text-slate-200 block">{viewAppModal.previousComputerKnowledge}</strong></div>
              </div>
            </div>

            {/* Additional Remarks */}
            {viewAppModal.adminRemarks && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <strong className="block font-bold mb-0.5">Admin Remarks:</strong>
                {viewAppModal.adminRemarks}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setViewAppModal(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. APPROVE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(approveConfirmModal)}
        onClose={() => setApproveConfirmModal(null)}
        title="Confirm Application Approval"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p className="text-sm text-slate-200">
            Are you sure you want to approve application <strong className="text-emerald-400 font-mono">{approveConfirmModal?.applicationId}</strong> for <strong className="text-white">{approveConfirmModal?.fullName}</strong>?
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setApproveConfirmModal(null)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleApproveConfirm}>
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3. REJECT CONFIRMATION MODAL WITH REQUIRED REMARKS */}
      <Modal
        isOpen={Boolean(rejectModal)}
        onClose={() => setRejectModal(null)}
        title="Reject Application & Add Remark"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p className="text-sm text-slate-200">
            Rejecting application <strong className="text-red-400 font-mono">{rejectModal?.applicationId}</strong>. Please enter the reason or remark for the student:
          </p>

          <div>
            <label className="block font-semibold uppercase text-slate-400 mb-1">Admin Remark / Reason *</label>
            <textarea
              rows={3}
              placeholder="e.g. Document mismatch, batch full, or incorrect details..."
              value={rejectRemark}
              onChange={(e) => setRejectRemark(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="danger" icon={XCircle} onClick={handleRejectConfirm}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. VIEW ENQUIRY MODAL */}
      <Modal
        isOpen={Boolean(viewEnquiryModal)}
        onClose={() => setViewEnquiryModal(null)}
        title="Contact Inquiry Details"
        maxWidth="max-w-md"
      >
        {viewEnquiryModal && (
          <div className="space-y-4 text-xs text-slate-300">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div className="font-bold text-white text-sm">{viewEnquiryModal.name}</div>
              <div className="text-blue-400">{viewEnquiryModal.phone} | {viewEnquiryModal.email}</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <a
                href={`https://wa.me/91${viewEnquiryModal.phone ? viewEnquiryModal.phone.replace(/\D/g, '') : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                Reply via WhatsApp
              </a>
              <Button variant="ghost" onClick={() => setViewEnquiryModal(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        title={editingCourse ? "Edit Course Information" : "Add New Course"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveCourse} className="space-y-5 text-xs text-slate-300">
          {courseModalError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{courseModalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Course Name */}
            <div className="sm:col-span-2">
              <label className="block font-semibold uppercase text-slate-400 mb-1">Course Name *</label>
              <input
                type="text"
                placeholder="e.g. Advanced Web Development"
                value={courseFormData.courseName}
                onChange={(e) => setCourseFormData({ ...courseFormData, courseName: e.target.value })}
                className={`w-full bg-slate-950 border ${courseFormErrors.courseName ? 'border-red-500' : 'border-slate-800'} rounded-xl p-3 text-white focus:outline-none focus:border-amber-500`}
              />
              {courseFormErrors.courseName && <p className="text-red-400 mt-1">{courseFormErrors.courseName}</p>}
            </div>

            {/* Short Description */}
            <div className="sm:col-span-2">
              <label className="block font-semibold uppercase text-slate-400 mb-1">Short Description *</label>
              <textarea
                rows={2}
                placeholder="Brief summary of the course for cards and list views..."
                value={courseFormData.shortDescription}
                onChange={(e) => setCourseFormData({ ...courseFormData, shortDescription: e.target.value })}
                className={`w-full bg-slate-950 border ${courseFormErrors.shortDescription ? 'border-red-500' : 'border-slate-800'} rounded-xl p-3 text-white focus:outline-none focus:border-amber-500`}
              />
              {courseFormErrors.shortDescription && <p className="text-red-400 mt-1">{courseFormErrors.shortDescription}</p>}
            </div>

            {/* Detailed Description */}
            <div className="sm:col-span-2">
              <label className="block font-semibold uppercase text-slate-400 mb-1">Full / Detailed Description</label>
              <textarea
                rows={3}
                placeholder="Comprehensive overview of syllabus, topics, and practical focus..."
                value={courseFormData.detailedDescription}
                onChange={(e) => setCourseFormData({ ...courseFormData, detailedDescription: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Duration *</label>
              <input
                type="text"
                placeholder="e.g. 3 Months / 6 Months"
                value={courseFormData.duration}
                onChange={(e) => setCourseFormData({ ...courseFormData, duration: e.target.value })}
                className={`w-full bg-slate-950 border ${courseFormErrors.duration ? 'border-red-500' : 'border-slate-800'} rounded-xl p-3 text-white focus:outline-none focus:border-amber-500`}
              />
              {courseFormErrors.duration && <p className="text-red-400 mt-1">{courseFormErrors.duration}</p>}
            </div>

            {/* Total Fees */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Total Fee *</label>
              <input
                type="text"
                placeholder="e.g. Rs. 4,500 or [Contact Office]"
                value={courseFormData.totalFee}
                onChange={(e) => setCourseFormData({ ...courseFormData, totalFee: e.target.value, fee: e.target.value })}
                className={`w-full bg-slate-950 border ${courseFormErrors.totalFee ? 'border-red-500' : 'border-slate-800'} rounded-xl p-3 text-white focus:outline-none focus:border-amber-500`}
              />
              {courseFormErrors.totalFee && <p className="text-red-400 mt-1">{courseFormErrors.totalFee}</p>}
            </div>

            {/* Eligibility */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Eligibility *</label>
              <input
                type="text"
                placeholder="e.g. Open to all (10th/12th/College)"
                value={courseFormData.eligibility}
                onChange={(e) => setCourseFormData({ ...courseFormData, eligibility: e.target.value })}
                className={`w-full bg-slate-950 border ${courseFormErrors.eligibility ? 'border-red-500' : 'border-slate-800'} rounded-xl p-3 text-white focus:outline-none focus:border-amber-500`}
              />
              {courseFormErrors.eligibility && <p className="text-red-400 mt-1">{courseFormErrors.eligibility}</p>}
            </div>

            {/* Image URL */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Course Image URL (Optional)</label>
              <input
                type="text"
                placeholder="https://example.com/course-image.jpg"
                value={courseFormData.imageUrl}
                onChange={(e) => setCourseFormData({ ...courseFormData, imageUrl: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g. Certified Program"
                value={courseFormData.category}
                onChange={(e) => setCourseFormData({ ...courseFormData, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Status (Active / Inactive) */}
            <div>
              <label className="block font-semibold uppercase text-slate-400 mb-1">Course Status *</label>
              <select
                value={courseFormData.status}
                onChange={(e) => setCourseFormData({ ...courseFormData, status: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                <option value="active">Active (Available for Admission & Public Page)</option>
                <option value="inactive">Inactive (Hidden from Admissions)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={() => setIsCourseModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isCourseSubmitting}>
              {isCourseSubmitting ? "Saving to Database..." : editingCourse ? "Update Course" : "Save New Course"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. DELETE COURSE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(courseToDelete)}
        onClose={() => setCourseToDelete(null)}
        title="Confirm Delete Course"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p className="text-sm text-slate-200">
            Are you sure you want to delete this course?
          </p>
          {courseToDelete && (
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-amber-400 font-bold text-sm">
              {courseToDelete.courseName || courseToDelete.title}
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            This action will remove the course from the database. Existing student applications will remain unchanged.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setCourseToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={handleDeleteCourseConfirm}>
              Delete Course
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
