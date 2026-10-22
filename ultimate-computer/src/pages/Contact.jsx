import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SectionHeader } from '../components/ui/SectionHeader';
import { submitEnquiry } from '../services/enquiryService';
import { Phone, Mail, MapPin, Clock, Send, CheckCircle2, MessageSquare, ChevronDown, HelpCircle, AlertCircle } from 'lucide-react';

export const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    subject: 'Course Information',
    message: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [openFaq, setOpenFaq] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name.trim() || !formData.phone.trim()) {
      setErrorMsg('Please enter your name and phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitEnquiry(formData);
      setIsSent(true);
    } catch (error) {
      console.error("Error submitting contact enquiry:", error);
      setErrorMsg("Failed to send enquiry. Please call us directly at +91 9422295496.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqs = [
    {
      question: "What are the lab timings for practical classes?",
      answer: "Our computer labs are open from 8:00 AM to 8:00 PM (Monday to Saturday). Students are allotted a dedicated 2-hour practical lab slot based on their batch preference."
    },
    {
      question: "Will I get a government recognized ISO certificate?",
      answer: "Yes! Ultimate Computer issues ISO 9001:2015 certified certificates upon successful completion of your course and practical exam. Our certificates are valid for corporate jobs and competitive exams."
    },
    {
      question: "Can I pay course fees in monthly installments?",
      answer: "Yes, we offer easy 2 to 3 monthly installment plans for long-term courses like Full Stack Web Development, Python, and Tally Prime with GST."
    },
    {
      question: "What if I miss a practical lab lecture?",
      answer: "We offer backup practical lab sessions and weekend doubt clearance classes so you never lag behind in syllabus coverage."
    }
  ];

  return (
    <div className="space-y-16 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <section className="text-center space-y-4 pt-6">
        <Badge variant="cyan">Get In Touch</Badge>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
          Contact <span className="gradient-text">Ultimate Computer</span>
        </h1>
        <p className="text-base text-slate-300 max-w-2xl mx-auto">
          Have questions regarding courses, admission criteria, or fees? Call our office at <strong className="text-blue-400">+91 9422295496</strong> or send us a message.
        </p>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Contact Cards */}
        <div className="lg:col-span-5 space-y-6">
          {/* Phone Card */}
          <a
            href="tel:+919422295496"
            className="glass-panel p-6 rounded-2xl border border-blue-500/30 hover:border-blue-400 flex items-center gap-4 transition-all group block"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0 group-hover:scale-110 transition-transform">
              <Phone className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Direct Admissions Helpline</span>
              <h3 className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors">
                +91 9422295496
              </h3>
              <p className="text-xs text-emerald-400 font-medium mt-0.5">Click to Call Now</p>
            </div>
          </a>

          {/* Email & Hours */}
          <div className="space-y-4">
            <Card className="border border-slate-800">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-800 text-cyan-400 shrink-0">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white mb-1">Email Inquiry</h4>
                  <a href="mailto:ultimategeorai@gmail.com" className="text-slate-300 text-sm hover:text-cyan-400 transition-colors">
                    ultimategeorai@gmail.com
                  </a>
                </div>
              </div>
            </Card>

            <Card className="border border-slate-800">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-800 text-amber-400 shrink-0">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white mb-1">Campus Address</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    Ultimate Computer Building, Near City Bus Stop, Main Market Road, Maharashtra.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border border-slate-800">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-800 text-emerald-400 shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white mb-1">Office Hours</h4>
                  <p className="text-slate-300 text-sm">
                    Monday – Saturday: 8:00 AM – 8:00 PM <br />
                    Sunday: Closed (Available via phone call)
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column: Contact Form */}
        <div className="lg:col-span-7">
          <Card className="border border-slate-800 bg-slate-900/90 p-6 sm:p-8">
            {isSent ? (
              <div className="text-center py-8 space-y-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-2xl font-bold text-white">Thank You for Reaching Out!</h3>
                <p className="text-sm text-slate-300">
                  Your enquiry has been saved to our database. Our counselor will get back to you shortly at <strong className="text-blue-400">{formData.phone}</strong>.
                </p>
                <Button variant="outline" size="sm" onClick={() => { setIsSent(false); setFormData({ name: '', phone: '', email: '', subject: 'Course Information', message: '' }); }}>
                  Send Another Inquiry
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-400" /> Send An Online Inquiry
                  </h3>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Amit Kumar"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9209982336"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. email@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Inquiry Subject
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Course Information">Course Details & Syllabus</option>
                    <option value="Fee Structure">Fee Structure & Installments</option>
                    <option value="Batch Schedule">Batch Timings & Seat Availability</option>
                    <option value="Certification Query">ISO Certification Query</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Your Message / Question
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Type your message here..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  icon={Send}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting Inquiry..." : "Send Inquiry Message"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>

      {/* FAQ Accordion */}
      <section className="pt-8 space-y-6">
        <SectionHeader
          badge="Frequently Asked Questions"
          title="Common Admission & Lab Queries"
          subtitle="Quick answers to help you get started with your computer training."
        />

        <div className="max-w-4xl mx-auto space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="glass-panel rounded-2xl border border-slate-800 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-white hover:text-blue-400 transition-colors"
                >
                  <span className="flex items-center gap-3 text-base">
                    <HelpCircle className="w-5 h-5 text-blue-400 shrink-0" />
                    {faq.question}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
