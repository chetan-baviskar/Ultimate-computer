import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, BookOpen, Monitor, Users, Target } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { SectionHeader } from '../components/ui/SectionHeader';
import { CourseCard } from '../components/courses/CourseCard';
import { HeroVisual } from '../components/common/HeroVisual';
import { AdmissionSteps } from '../components/common/AdmissionSteps';
import { ContactCTA } from '../components/common/ContactCTA';
import { subscribeCourses } from '../services/courseService';
import { whyChooseUsData, instituteStats } from '../data/whyChooseUsData';

export const Home = ({ setActivePage, onSelectCourse, onApplyCourse, setSelectedCourseForAdmission }) => {
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

  const handleApplyCourseClick = (course) => {
    if (onApplyCourse) {
      onApplyCourse(course);
    } else {
      if (setSelectedCourseForAdmission) {
        setSelectedCourseForAdmission(course.courseName || course.title);
      }
      setActivePage('admission');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const featureIconMap = {
    Monitor: Monitor,
    Users: Users,
    Sparkles: Sparkles,
    Target: Target,
  };

  return (
    <div className="space-y-20 sm:space-y-28 pb-16 overflow-hidden">
      {/* HERO SECTION */}
      <section className="relative pt-8 lg:pt-16 pb-12 lg:pb-20 border-b border-slate-800/60">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Hero Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-7 space-y-6 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-blue-500/30 text-xs sm:text-sm font-semibold text-blue-400 shadow-xl">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span>Professional Computer Education & Training</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
                Master Practical Computer Skills at <br className="hidden sm:inline" />
                <span className="gradient-text">Ultimate Computer</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Gain hands-on computer knowledge, programming fundamentals, web development, and digital design skills. Our career-oriented training helps you build real confidence for job opportunities and higher education.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Button
                  variant="primary"
                  size="xl"
                  icon={BookOpen}
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setActivePage('courses');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Explore Courses
                </Button>
                <Button
                  variant="secondary"
                  size="xl"
                  icon={ArrowRight}
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setActivePage('admission');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Apply for Admission
                </Button>
              </div>
            </motion.div>

            {/* Right Hero Technology Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-5"
            >
              <HeroVisual />
            </motion.div>
          </div>

          {/* STATS SECTION */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-16 pt-12 border-t border-slate-800/60">
            {instituteStats.map((stat, index) => (
              <div key={index} className="glass-panel p-5 rounded-2xl border border-slate-800 text-center">
                <div className="text-2xl sm:text-3xl font-extrabold text-white gradient-text">
                  {stat.number}
                </div>
                <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY CHOOSE ULTIMATE COMPUTER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge="Our Core Strengths"
          title="Why Choose Ultimate Computer"
          subtitle="We focus on structured practical training, student guidance, and modern curriculum to help you succeed."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {whyChooseUsData.map((feature) => {
            const IconComponent = featureIconMap[feature.icon] || Monitor;
            return (
              <Card key={feature.id} className="border border-slate-800 bg-slate-900/90 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-5">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* OUR COURSES PREVIEW (4 Cards using centralized data) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <SectionHeader
            badge="Training Programs"
            title="Our Courses"
            subtitle="Explore our 4 practical computer training programs designed for skill development."
            align="left"
            className="mb-0"
          />
          <Button
            variant="outline"
            size="md"
            icon={ArrowRight}
            onClick={() => {
              setActivePage('courses');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            View All Courses
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {courses.slice(0, 4).map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onSelectCourse={onSelectCourse}
              onApplyCourse={handleApplyCourseClick}
            />
          ))}
        </div>
      </section>

      {/* ADMISSION CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-slate-800 bg-slate-900/90 text-center space-y-6">
          <Badge variant="emerald" className="mx-auto">Admissions Open</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Start Your Computer Learning Journey
          </h2>
          <p className="text-base text-slate-300 max-w-xl mx-auto">
            Choose your course and submit your admission application online.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={ArrowRight}
              onClick={() => {
                setActivePage('admission');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Apply for Admission
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={BookOpen}
              onClick={() => {
                setActivePage('courses');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              View Courses
            </Button>
          </div>
        </div>
      </section>

      {/* HOW ADMISSION WORKS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AdmissionSteps />
      </section>

      {/* CONTACT CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ContactCTA />
      </section>
    </div>
  );
};
