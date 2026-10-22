import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { subscribeCourses } from '../services/courseService';
import { CheckCircle2, Phone, ArrowRight, ShieldCheck, DollarSign } from 'lucide-react';

export const FeeStructure = ({ setActivePage, setSelectedCourseForAdmission }) => {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeCourses((allCourses) => {
      const active = allCourses.filter(c => c.status === 'active' || !c.status);
      setCourses(active);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleApply = (courseTitle) => {
    if (setSelectedCourseForAdmission) {
      setSelectedCourseForAdmission(courseTitle);
    }
    setActivePage('admission');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-16 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <section className="text-center space-y-4 pt-6">
        <Badge variant="cyan">Centralized Fee Configuration</Badge>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Course <span className="gradient-text">Fee Structure</span>
        </h1>
        <p className="text-base text-slate-300 max-w-2xl mx-auto">
          View duration, level, and fee structure for all certified computer training programs at Ultimate Computer.
        </p>
      </section>

      {/* Fee Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {courses.map((course) => (
          <Card key={course.id} className="border border-slate-800 bg-slate-900/90 flex flex-col justify-between p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <Badge variant="primary">{course.category || "Certified"}</Badge>
                <span className="text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                  Level: {course.level || 'Beginner'}
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{course.courseName || course.title}</h3>
              <p className="text-xs text-slate-400 mb-6">Course Duration: <strong className="text-slate-200">{course.duration}</strong></p>

              {/* Centralized Fee Breakdown */}
              <div className="space-y-3 mb-6 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400 font-medium">Course Fee:</span>
                  <span className="font-bold text-slate-200">{course.fee || course.totalFee}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400 font-medium">Admission/Registration Fee:</span>
                  <span className="font-bold text-slate-200">{course.registrationFee || '[Included]'}</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-blue-400">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Total Fee Configuration:</span>
                  <span className="font-bold text-xs">{course.totalFee || course.fee}</span>
                </div>
              </div>

              {/* Key Skills */}
              <div className="space-y-2 mb-6">
                <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Key Skills Covered:</div>
                <div className="flex flex-wrap gap-1.5">
                  {(course.skillsCovered || ['Practical IT Skills']).slice(0, 4).map((skill, sIdx) => (
                    <span key={sIdx} className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-[11px] text-slate-300">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <a
                href="tel:+919422295496"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700"
              >
                <Phone className="w-3.5 h-3.5 text-blue-400" />
                Inquire (+91 9422295496)
              </a>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                icon={ArrowRight}
                onClick={() => handleApply(course.courseName || course.title)}
              >
                Apply for Course
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Note Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-blue-500/20 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-base font-bold text-white">Need Customized Fee Payment Assistance?</h4>
          <p className="text-xs text-slate-300">
            Contact our office directly at <strong className="text-blue-400 font-bold">+91 9422295496</strong> to discuss installment terms and batch timings.
          </p>
        </div>
        <a
          href="tel:+919422295496"
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shrink-0 transition-colors shadow-md shadow-blue-500/20"
        >
          Call +91 9422295496
        </a>
      </div>
    </div>
  );
};

