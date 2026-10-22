import React from 'react';
import { Clock, GraduationCap, ArrowRight, BookOpen, Monitor, Code, Sparkles, Layout } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export const CourseCard = ({ course, onSelectCourse, onApplyCourse }) => {
  const getIcon = (id) => {
    switch (id) {
      case 'computer-fundamentals':
        return Monitor;
      case 'advanced-programming':
        return Code;
      case 'web-development':
        return Sparkles;
      case 'graphic-design':
        return Layout;
      default:
        return BookOpen;
    }
  };

  const IconComponent = getIcon(course.id);

  return (
    <Card className="flex flex-col justify-between h-full group border border-slate-800/80 hover:border-blue-500/40">
      <div>
        {/* Top Visual & Category Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
            <IconComponent className="w-5 h-5" />
          </div>
          <Badge variant="primary">{course.category || "Certified"}</Badge>
        </div>

        {/* Course Title */}
        <h3 className="text-xl font-bold text-slate-100 group-hover:text-blue-400 transition-colors mb-3 line-clamp-2">
          {course.courseName || course.title}
        </h3>

        {/* Short Description */}
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6 line-clamp-3">
          {course.shortDescription}
        </p>

        {/* Duration & Eligibility Grid */}
        <div className="space-y-2 py-3 px-3.5 bg-slate-900/80 rounded-xl border border-slate-800 text-xs mb-6">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" /> Duration:
            </span>
            <span className="font-semibold text-slate-200">{course.duration}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Eligibility:
            </span>
            <span className="font-semibold text-slate-200 truncate max-w-[140px]" title={course.eligibility}>
              {course.eligibility}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onSelectCourse(course)}
        >
          View Full Details
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={ArrowRight}
          className="flex-1"
          onClick={() => onApplyCourse(course)}
        >
          Apply Now
        </Button>
      </div>
    </Card>
  );
};
