import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  ArrowLeft,
  Clock,
  GraduationCap,
  Award,
  CheckCircle2,
  BookOpen,
  Briefcase,
  Monitor,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  Phone,
  FileText,
  DollarSign
} from 'lucide-react';

export const CourseDetails = ({ course, onBack, onApply }) => {
  const [openModule, setOpenModule] = useState(0);

  if (!course) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Course Not Found</h2>
        <p className="text-slate-400 text-sm">Please return to the courses directory to select a valid course.</p>
        <Button variant="primary" icon={ArrowLeft} onClick={onBack}>
          Back to Courses
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="pt-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-300 hover:text-white transition-all group"
        >
          <ArrowLeft className="w-4 h-4 text-blue-400 group-hover:-translate-x-1 transition-transform" />
          <span>Back to All Courses</span>
        </button>
      </div>

      {/* Course Header Hero Banner */}
      <section className="glass-panel p-8 sm:p-12 rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900/95 via-blue-950/30 to-slate-900/95 relative overflow-hidden space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="primary">{course.category || "Certified Course"}</Badge>
          <Badge variant="cyan">{course.level}</Badge>
        </div>

        {/* Course Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
          {course.courseName}
        </h1>

        {/* Short Description */}
        <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
          {course.shortDescription}
        </p>

        {/* Key Quick Info Badges Grid (Duration, Eligibility, Level) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase">B. Course Duration</div>
              <div className="text-sm font-bold text-white">{course.duration}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase">C. Eligibility</div>
              <div className="text-sm font-bold text-white truncate">{course.eligibility}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase">D. Course Level</div>
              <div className="text-sm font-bold text-white">{course.level}</div>
            </div>
          </div>
        </div>

        {/* Hero Apply Button */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            icon={ArrowRight}
            onClick={() => onApply(course.courseName)}
          >
            N. Apply Now for this Course
          </Button>
        </div>
      </section>

      {/* Main Content Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Detailed Content (Col 8) */}
        <div className="lg:col-span-8 space-y-10">
          {/* E. DETAILED DESCRIPTION */}
          <section className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              A & E. Course Overview & Detailed Description
            </h3>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {course.detailedDescription}
            </p>
          </section>

          {/* G. COURSE MODULES */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                G. Detailed Course Modules & Syllabus
              </h3>
              <span className="text-xs text-slate-400">{(course.modules || []).length} Complete Modules</span>
            </div>

            <div className="space-y-3">
              {(course.modules || []).map((mod, idx) => {
                const isOpen = openModule === idx;
                return (
                  <div
                    key={idx}
                    className="glass-panel rounded-2xl border border-slate-800 overflow-hidden transition-all"
                  >
                    <button
                      onClick={() => setOpenModule(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-5 text-left font-bold text-white hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-mono">
                          {mod.moduleNumber || `0${idx + 1}`}
                        </span>
                        <span className="text-base font-bold text-white">{mod.title}</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-4 bg-slate-950/40">
                        <div>
                          <span className="text-xs uppercase font-bold text-slate-400 tracking-wider block mb-2">Topics Covered:</span>
                          <ul className="grid grid-cols-1 gap-2 text-sm text-slate-300">
                            {(mod.topics || []).map((topic, tIdx) => (
                              <li key={tIdx} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                <span>{topic}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {mod.practicalWork && (
                          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-200">
                            <strong className="text-blue-400 block font-semibold mb-0.5">Practical Exercise:</strong>
                            {mod.practicalWork}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* H. PRACTICAL TRAINING */}
          <section className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-emerald-400" />
              H. Practical Lab Training
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(course.practicalTraining || ['100% Practical lab training with personal computer']).map((pt, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm text-slate-300 leading-relaxed">{pt}</span>
                </div>
              ))}
            </div>
          </section>

          {/* F & I. SKILLS COVERED */}
          <section className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              F & I. Skills You Will Gain
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {(course.skillsCovered || ['Computer Literacy', 'Practical IT Skills']).map((skill, idx) => (
                <span
                  key={idx}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:border-blue-500/40 transition-colors"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* J. CAREER OPPORTUNITIES */}
          <section className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-purple-400" />
              J. Career Opportunities
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(course.careerOpportunities || ['Office Executive', 'Computer Operator']).map((career, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 text-center">
                  <span className="text-sm font-semibold text-purple-200">{career}</span>
                </div>
              ))}
            </div>
          </section>

          {/* K. COURSE HIGHLIGHTS */}
          <section className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-cyan-400" />
              K. Key Course Highlights
            </h3>
            <ul className="space-y-2.5">
              {(course.courseHighlights || ['Certified computer training program']).map((ch, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{ch}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right Sidebar (Col 4) - Fee Summary, Admission Info & Apply Button */}
        <div className="lg:col-span-4 space-y-6">
          {/* M. FEE SUMMARY CARD */}
          <Card className="border border-blue-500/30 bg-slate-900/90 space-y-5 p-6 sticky top-24">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-xs uppercase font-bold text-blue-400 tracking-wider block">M. Fee Summary</span>
              <h4 className="text-lg font-bold text-white">{course.courseName}</h4>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 font-semibold block">Course Fee:</span>
                <span className="text-slate-200 font-bold text-sm">{course.fee}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 font-semibold block">Registration / Admission Fee:</span>
                <span className="text-slate-200 font-bold text-sm">{course.registrationFee}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-1">
                <span className="text-blue-400 font-semibold block uppercase tracking-wider text-[10px]">Total Fee Configuration:</span>
                <span className="text-white font-black text-sm">{course.totalFee}</span>
              </div>
            </div>

            {/* L. ADMISSION INFORMATION */}
            <div className="pt-2 space-y-2 text-xs text-slate-300">
              <strong className="text-slate-200 block font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                L. Admission Information:
              </strong>
              <p className="leading-relaxed text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                {course.admissionInfo}
              </p>
            </div>

            {/* Helpline Call Trigger */}
            <a
              href="tel:+919422295496"
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition-colors"
            >
              <Phone className="w-4 h-4 text-blue-400" />
              <span>Inquire Fee Helpline: +91 9422295496</span>
            </a>

            {/* N. APPLY NOW BUTTON */}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              icon={ArrowRight}
              onClick={() => onApply(course.courseName)}
            >
              N. Apply Now
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
