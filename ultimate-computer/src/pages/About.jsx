import React from 'react';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Monitor, Award, ShieldCheck, Target, Eye, Users, CheckCircle2, Phone, Building, Cpu, Wifi, BookOpen } from 'lucide-react';

export const About = ({ setActivePage }) => {
  return (
    <div className="space-y-20 pb-16">
      {/* Header Banner */}
      <section className="relative pt-8 pb-12 text-center border-b border-slate-800/60">
        <div className="max-w-4xl mx-auto px-4 space-y-4">
          <Badge variant="primary">Empowering Digital India</Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            About <span className="gradient-text">Ultimate Computer</span> Institute
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            Ultimate Computer is a premier IT and computer training center dedicated to providing world-class practical education to students, job seekers, and working professionals.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="border border-blue-500/20 bg-slate-900/80">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-6">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Our Mission</h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              To bridge the gap between academic education and real-world industry requirements by delivering 100% practical computer training, certified courses, and career placement guidance.
            </p>
          </Card>

          <Card className="border border-cyan-500/20 bg-slate-900/80">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
              <Eye className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Our Vision</h3>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              To be the most trusted computer education brand recognized for technical excellence, student satisfaction, and fostering innovation across software development, accounting, and digital design.
            </p>
          </Card>
        </div>
      </section>

      {/* Infrastructure & Facilities */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          badge="World-Class Environment"
          title="Modern Campus Infrastructure"
          subtitle="We believe learning thrives in an environment equipped with modern technology and comfortable facilities."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: Cpu,
              title: "High-Spec Computer Labs",
              description: "Latest Intel i5/i7 workstations with SSDs, dual monitors, and high-performance dedicated GPUs."
            },
            {
              icon: Wifi,
              title: "High-Speed Internet",
              description: "Uninterrupted fiber optic broadband connectivity for seamless online research and project deployment."
            },
            {
              icon: Building,
              title: "Air-Conditioned Classrooms",
              description: "Spacious, ergonomic seating with modern HD projectors for clear visual presentations."
            },
            {
              icon: BookOpen,
              title: "Digital Study Material",
              description: "Comprehensive print notes, video reference guides, and project source code repositories."
            }
          ].map((item, idx) => (
            <Card key={idx} className="border border-slate-800">
              <div className="p-3 w-fit rounded-xl bg-slate-800/80 text-blue-400 mb-4">
                <item.icon className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{item.title}</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{item.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ISO Certification Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-emerald-500/30 bg-slate-900/90 flex flex-col md:flex-row items-center gap-8">
          <div className="w-24 h-24 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Award className="w-12 h-12" />
          </div>
          <div className="space-y-3 text-center md:text-left flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" /> Government Recognized ISO Standard
            </div>
            <h3 className="text-2xl font-bold text-white">ISO 9001:2015 Quality Certification</h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              Our curriculum, lab standards, and teaching methodologies adhere to international ISO 9001:2015 quality standards. Certificates issued by Ultimate Computer are recognized by private corporations, MNCs, and government recruitment boards.
            </p>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="max-w-7xl mx-auto px-4 text-center">
        <div className="glass-panel p-8 rounded-2xl border border-slate-800 space-y-4 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-white">Have Questions About Admissions?</h3>
          <p className="text-slate-300 text-sm">
            Contact our academic coordinator directly at <strong className="text-blue-400">+91 9422295496</strong> or visit our campus for a free counseling session.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <a
              href="tel:+919422295496"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all"
            >
              <Phone className="w-4 h-4" /> Call +91 9422295496
            </a>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setActivePage('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Contact Us Page
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
