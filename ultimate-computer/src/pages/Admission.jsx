import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { coursesData } from '../data/coursesData';
import { subscribeCourses } from '../services/courseService';
import {
  submitAdmissionApplication,
  checkDuplicateApplication
} from '../services/admissionService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  User,
  Phone,
  Mail,
  GraduationCap,
  Calendar,
  MapPin,
  Send,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  FileText
} from 'lucide-react';

export const Admission = ({ selectedCourseTitle, setActivePage }) => {
  const { currentUser, userProfile } = useAuth();

  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const [selectedCourseObj, setSelectedCourseObj] = useState(() => {
    if (selectedCourseTitle) {
      const found = coursesData.find(
        c => c.courseName === selectedCourseTitle || c.title === selectedCourseTitle
      );
      if (found) return found;
    }
    return coursesData[0];
  });

  const [formData, setFormData] = useState({
    fullName: userProfile?.fullName || '',
    email: userProfile?.email || currentUser?.email || '',
    mobile: userProfile?.mobile || '',
    dateOfBirth: '',
    gender: 'Male',
    address: '',
    city: '',
    education: 'Undergraduate / College Student',
    previousComputerKnowledge: 'Beginner',
    preferredContactMethod: 'WhatsApp',
    additionalMessage: ''
  });

  useEffect(() => {
    const unsubscribe = subscribeCourses((allCourses) => {
      // Filter ONLY courses with status = "active"
      const activeOnly = allCourses.filter(c => c.status === 'active' || !c.status);
      setCourses(activeOnly);
      setCoursesLoading(false);

      // Auto select matching course if title was passed
      if (selectedCourseTitle && activeOnly.length > 0) {
        const found = activeOnly.find(
          c => c.courseName === selectedCourseTitle || c.title === selectedCourseTitle
        );
        if (found) {
          setSelectedCourseObj(found);
          return;
        }
      }

      // If current selectedCourseObj is not in activeOnly list, select first active course
      if (activeOnly.length > 0) {
        setSelectedCourseObj(prev => {
          const stillActive = activeOnly.find(c => c.id === prev?.id);
          return stillActive || activeOnly[0];
        });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [selectedCourseTitle]);

  useEffect(() => {
    if (userProfile) {
      setFormData(prev => ({
        ...prev,
        fullName: prev.fullName || userProfile.fullName || '',
        email: prev.email || userProfile.email || '',
        mobile: prev.mobile || userProfile.mobile || ''
      }));
    }
  }, [userProfile]);

  const [step, setStep] = useState('form'); // 'form' | 'review' | 'success'
  const [errors, setErrors] = useState({});
  const [duplicateApp, setDuplicateApp] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleCourseChange = (e) => {
    const courseId = e.target.value;
    const found = courses.find(c => c.id === courseId);
    if (found) setSelectedCourseObj(found);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = "Full Name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Enter a valid email address";
    }
    if (!formData.mobile.trim()) {
      newErrors.mobile = "Mobile number is required";
    } else if (!/^[6-9]\d{9}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = "Enter a valid 10-digit Indian mobile number";
    }
    if (!formData.dateOfBirth) newErrors.dateOfBirth = "Date of Birth is required";
    if (!formData.city.trim()) newErrors.city = "City is required";
    if (!formData.address.trim()) newErrors.address = "Address is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToReview = async (e) => {
    e.preventDefault();
    setServerError('');
    setDuplicateApp(null);

    if (!validateForm()) return;

    // Check duplicate submission (the API matches a signed-in applicant on
    // their verified session and a guest on the e-mail they will submit with)
    const uid = currentUser?.uid || userProfile?.uid || formData.email;
    const existing = await checkDuplicateApplication(uid, selectedCourseObj.id, formData.email);
    if (existing) {
      setDuplicateApp(existing);
      return;
    }

    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setServerError('');
    try {
      const uid = currentUser?.uid || userProfile?.uid || 'guest-student';
      const result = await submitAdmissionApplication(uid, formData, selectedCourseObj);
      setSubmittedData(result);
      setStep('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Submission error:", error);
      setServerError(error.message || "Failed to submit admission application to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-12 pb-16 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Header Banner */}
      <section className="text-center space-y-3 pt-6">
        <Badge variant="emerald">Online Admission Enrolment 2026-27</Badge>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Apply For Admission at <span className="gradient-text">Ultimate Computer</span>
        </h1>
        <p className="text-base text-slate-300 max-w-2xl mx-auto">
          Submit your official course enrolment application below. Our admissions counselor will contact you on <strong className="text-blue-400">+91 9422295496</strong> to confirm batch allotment.
        </p>
      </section>

      {/* DUPLICATE APPLICATION ALERT */}
      {duplicateApp && (
        <Card className="border border-amber-500/40 bg-slate-900/90 p-6 space-y-4">
          <div className="flex items-start gap-3 text-amber-400">
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold text-white">Active Application Already Exists</h3>
              <p className="text-xs text-slate-300 mt-1">
                You have already submitted an active admission application for <strong className="text-amber-400">{duplicateApp.courseName}</strong> (Application ID: <span className="font-mono">{duplicateApp.applicationId}</span>, Status: <span className="font-bold">{duplicateApp.status}</span>).
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setActivePage('student-dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              View My Application in Dashboard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDuplicateApp(null)}
            >
              Apply for a Different Course
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION SCREEN */}
      {step === 'success' && submittedData ? (
        <Card className="border border-emerald-500/40 bg-slate-900/90 space-y-6 p-8 sm:p-10">
          <div className="flex items-center gap-3 text-emerald-400 border-b border-slate-800 pb-4">
            <CheckCircle2 className="w-10 h-10 shrink-0" />
            <div>
              <h2 className="text-2xl font-extrabold text-white">Application Submitted Successfully!</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Official Reference ID: <strong className="text-emerald-400 font-mono text-sm">{submittedData.applicationId}</strong>
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4 text-sm">
            <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">Application Details Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 text-xs block">Applicant Name</span>
                <span className="text-slate-100 font-semibold">{submittedData.fullName}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Selected Course</span>
                <span className="text-blue-400 font-semibold">{submittedData.courseName}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Mobile Number</span>
                <span className="text-slate-100 font-semibold">{submittedData.mobile}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Email Address</span>
                <span className="text-slate-100 font-semibold">{submittedData.email}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Course Fee Configuration</span>
                <span className="text-slate-200 font-semibold">{submittedData.totalFee}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Application Status</span>
                <span className="text-amber-400 font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 text-xs">
                  {submittedData.status}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-300 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-400 block font-semibold mb-0.5">Direct Admission Contact:</strong>
              Your application has been saved to our database. For instant batch confirmation, contact Ultimate Computer helpline at <a href="tel:+919422295496" className="text-blue-400 font-bold underline">+91 9422295496</a> or send your Application ID via WhatsApp.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={`https://wa.me/919422295496?text=Hello%20Ultimate%20Computer,%20I%20have%20submitted%20my%20admission%20application%20(${submittedData.applicationId})%20for%20${encodeURIComponent(submittedData.courseName)}.`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Helpline (+91 9422295496)
            </a>

            <Button
              variant="primary"
              onClick={() => {
                setActivePage('student-dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex-1"
            >
              View My Application in Dashboard
            </Button>
          </div>
        </Card>
      ) : step === 'review' ? (
        /* STEP 2: CONFIRMATION REVIEW STEP */
        <Card className="border border-slate-800 bg-slate-900/90 p-6 sm:p-10 space-y-6">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-bold text-blue-400 tracking-wider">Step 2 of 2</span>
              <h2 className="text-2xl font-bold text-white">Review & Confirm Application</h2>
            </div>
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setStep('form')}>
              Edit Details
            </Button>
          </div>

          {serverError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="space-y-6 text-sm">
            {/* Student Info */}
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider">1. Applicant Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Name:</span> <strong className="text-white">{formData.fullName}</strong></div>
                <div><span className="text-slate-500">Email:</span> <strong className="text-white">{formData.email}</strong></div>
                <div><span className="text-slate-500">Mobile:</span> <strong className="text-white">{formData.mobile}</strong></div>
                <div><span className="text-slate-500">Date of Birth:</span> <strong className="text-white">{formData.dateOfBirth}</strong></div>
                <div><span className="text-slate-500">Gender:</span> <strong className="text-white">{formData.gender}</strong></div>
                <div><span className="text-slate-500">City / Location:</span> <strong className="text-white">{formData.city}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Address:</span> <strong className="text-white">{formData.address}</strong></div>
              </div>
            </div>

            {/* Course & Fee Breakdown */}
            <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-3">
              <h4 className="text-xs uppercase font-bold text-blue-400 tracking-wider">2. Selected Program & Fee Breakdown</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Selected Program:</span>
                  <span className="font-bold text-white text-sm">{selectedCourseObj.courseName || selectedCourseObj.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration:</span>
                  <span className="font-semibold text-slate-200">{selectedCourseObj.duration}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Course Fee:</span>
                  <span className="font-bold text-slate-200">{selectedCourseObj.fee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Admission / Registration Fee:</span>
                  <span className="font-bold text-slate-200">{selectedCourseObj.registrationFee}</span>
                </div>
                <div className="flex justify-between text-blue-400 pt-1 font-bold">
                  <span>Total Fee Configuration:</span>
                  <span>{selectedCourseObj.totalFee}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
            <Button variant="ghost" className="flex-1" onClick={() => setStep('form')}>
              Back to Form
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="flex-1"
              icon={Send}
              disabled={isSubmitting}
              onClick={handleConfirmSubmit}
            >
              {isSubmitting ? "Submitting to Database..." : "Confirm & Submit Application"}
            </Button>
          </div>
        </Card>
      ) : (
        /* STEP 1: ADMISSION FORM FILLING */
        <Card className="border border-slate-800 bg-slate-900/90 p-6 sm:p-10">
          <form onSubmit={handleProceedToReview} className="space-y-8">
            {/* 1. PERSONAL DETAILS */}
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-400" />
                  1. Personal Information
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className={`w-full bg-slate-950 border ${errors.fullName ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                  />
                  {errors.fullName && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.fullName}</p>}
                </div>

                {/* Mobile Phone */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className={`w-full bg-slate-950 border ${errors.mobile ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                  />
                  {errors.mobile && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.mobile}</p>}
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. student@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full bg-slate-950 border ${errors.email ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                  />
                  {errors.email && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.email}</p>}
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className={`w-full bg-slate-950 border ${errors.dateOfBirth ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                  />
                  {errors.dateOfBirth && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.dateOfBirth}</p>}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    City / Location *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. City Name"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={`w-full bg-slate-950 border ${errors.city ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                  />
                  {errors.city && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.city}</p>}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Residential Address *
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter street address, area, and pincode"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className={`w-full bg-slate-950 border ${errors.address ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500`}
                />
                {errors.address && <p className="text-xs text-red-400 mt-1">{errors.address}</p>}
              </div>
            </div>

            {/* 2. COURSE SELECTION & FEE SYNC */}
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-cyan-400" />
                  2. Course Selection & Centralized Fee Sync
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Select Course Dropdown */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Select Course *
                  </label>
                  <select
                    value={selectedCourseObj?.id || ''}
                    onChange={handleCourseChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.courseName || c.title} ({c.duration})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Education */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Highest Qualification
                  </label>
                  <select
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="10th / 12th Student">10th / 12th Student</option>
                    <option value="Undergraduate / College Student">Undergraduate / College Student</option>
                    <option value="Graduate (BCA / B.Sc / B.Com / B.Tech)">Graduate (BCA / B.Sc / B.Com / B.Tech)</option>
                    <option value="Working Professional">Working Professional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Previous Computer Knowledge */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Previous Computer Knowledge
                  </label>
                  <select
                    value={formData.previousComputerKnowledge}
                    onChange={(e) => setFormData({ ...formData, previousComputerKnowledge: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Beginner (Basic / None)">Beginner (Basic / None)</option>
                    <option value="Intermediate (MS Office / Basics)">Intermediate (MS Office / Basics)</option>
                    <option value="Advanced (Coding / Design Background)">Advanced (Coding / Design Background)</option>
                  </select>
                </div>

                {/* Preferred Contact Method */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Preferred Contact Method
                  </label>
                  <select
                    value={formData.preferredContactMethod}
                    onChange={(e) => setFormData({ ...formData, preferredContactMethod: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Phone Call">Direct Phone Call</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
              </div>

              {/* LIVE FEE INFORMATION BOX */}
              <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold text-blue-400 tracking-wider">Fee Information Sync</span>
                  <span className="text-xs font-semibold text-slate-400">Duration: {selectedCourseObj.duration}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block mb-0.5">Course Fee:</span>
                    <span className="font-bold text-slate-200">{selectedCourseObj.fee}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block mb-0.5">Registration Fee:</span>
                    <span className="font-bold text-slate-200">{selectedCourseObj.registrationFee}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                    <span className="text-blue-400 font-semibold block mb-0.5">Total Fee Configuration:</span>
                    <span className="font-bold text-white">{selectedCourseObj.totalFee}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Message */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Additional Remarks / Preferred Batch Timing (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Mention any preferred time slot or specific inquiry"
                value={formData.additionalMessage}
                onChange={(e) => setFormData({ ...formData, additionalMessage: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                size="xl"
                className="w-full"
                icon={ArrowRight}
              >
                Proceed to Review Application
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};
