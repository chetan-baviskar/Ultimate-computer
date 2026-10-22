import React, { useState, useEffect } from 'react';
import { Search, Filter, BookOpen, AlertCircle } from 'lucide-react';
import { SectionHeader } from '../components/ui/SectionHeader';
import { CourseCard } from '../components/courses/CourseCard';
import { courseCategories } from '../data/coursesData';
import { subscribeCourses } from '../services/courseService';
import { Badge } from '../components/ui/Badge';

export const Courses = ({ onSelectCourse, onApplyCourse }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeCourses(
      (data) => {
        setCourses(data);
        setLoading(false);
        setError('');
      },
      (err) => {
        setError(err.message || 'Failed to load courses from the database.');
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Show active courses on public view
  const activeCourses = courses.filter((c) => c.status === 'active' || !c.status);

  const filteredCourses = activeCourses.filter((course) => {
    const name = course.courseName || course.title || '';
    const desc = course.shortDescription || '';
    const cat = course.category || '';
    const matchesCategory =
      selectedCategory === "All" || (cat && cat.toLowerCase() === selectedCategory.toLowerCase());
    const matchesSearch =
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-12 pb-16">
      {/* Page Banner */}
      <section className="relative pt-8 pb-6 border-b border-slate-800/60 text-center">
        <div className="max-w-4xl mx-auto px-4 space-y-4">
          <Badge variant="cyan">Structured IT Curriculum</Badge>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            Our Certified <span className="gradient-text">Computer Courses</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300">
            Explore our practical computer programs designed for practical skills, higher education, and career development.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Search & Filter Bar */}
        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search Box */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search courses (e.g. Web, C++, Office)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                <Filter className="w-3.5 h-3.5 text-blue-400" /> Category:
              </span>
              {courseCategories.map((cat) => {
                const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* LOADING STATE */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Loading courses from database...</p>
          </div>
        ) : filteredCourses.length > 0 ? (
          /* Course Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onSelectCourse={onSelectCourse}
                onApplyCourse={onApplyCourse}
              />
            ))}
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="glass-panel p-12 rounded-2xl text-center border border-slate-800 space-y-4">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-xl font-bold text-slate-300">No courses match your filter</h3>
            <p className="text-slate-500 text-sm">Try searching for a different keyword or select "All" categories.</p>
            <button
              onClick={() => {
                setSelectedCategory("All");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

