import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Clock, Users, Star, Award, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

export const CourseDetailModal = ({ course, isOpen, onClose, onApply }) => {
  if (!course) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={course.title} maxWidth="max-w-3xl">
      <div className="space-y-6">
        {/* Course Header Info */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <Badge variant="primary">{course.category}</Badge>
            <Badge variant="cyan">{course.level}</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-sm">
            <Star className="w-4 h-4 fill-amber-400" />
            <span>{course.rating} Rating</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300 font-normal">{course.studentsEnrolled} enrolled</span>
          </div>
        </div>

        {/* Overview */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Course Overview
          </h4>
          <p className="text-slate-300 leading-relaxed text-base">
            {course.fullDescription}
          </p>
        </div>

        {/* Highlights / Syllabus */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-3">
            What You Will Learn (Syllabus Modules)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {course.highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-800/40 border border-slate-800/80">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-200">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-blue-400 font-medium text-xs mb-1">
              <Clock className="w-4 h-4" /> Duration
            </div>
            <div className="text-slate-100 font-semibold text-sm">{course.duration}</div>
          </div>

          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-cyan-400 font-medium text-xs mb-1">
              <Award className="w-4 h-4" /> Certification
            </div>
            <div className="text-slate-100 font-semibold text-sm truncate">{course.certificate}</div>
          </div>

          <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs mb-1">
              <ShieldCheck className="w-4 h-4" /> Job Assistance
            </div>
            <div className="text-slate-100 font-semibold text-sm truncate">{course.jobAssistance}</div>
          </div>
        </div>

        {/* Prerequisites */}
        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-300">
          <strong className="text-blue-400 font-semibold">Prerequisites: </strong>
          {course.prerequisites}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={ArrowRight}
            onClick={() => {
              onClose();
              if (onApply) onApply(course);
            }}
          >
            Apply For This Course
          </Button>
        </div>
      </div>
    </Modal>
  );
};
