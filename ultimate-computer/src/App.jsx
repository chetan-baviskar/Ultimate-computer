import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

import { TopHeader } from './components/layout/TopHeader';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { BackArrow } from './components/ui/BackArrow';

import { Home } from './pages/Home';
import { About } from './pages/About';
import { Courses } from './pages/Courses';
import { CourseDetails } from './pages/CourseDetails';
import { FeeStructure } from './pages/FeeStructure';
import { Admission } from './pages/Admission';
import { Contact } from './pages/Contact';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { StudentDashboard } from './pages/StudentDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { NotFound } from './pages/NotFound';

// Every page id the router knows about (anything else renders the 404 page).
const KNOWN_PAGES = [
  'home', 'about', 'courses', 'course-details', 'fee-structure', 'admission',
  'contact', 'login', 'register', 'forgot-password', 'student-dashboard',
  'admin-dashboard', '404',
];

// Pages that already have their own (contextual) back navigation, so the
// shared back arrow is not shown twice on them. Home never needs one.
const PAGES_WITH_OWN_BACK = ['home', 'course-details', '404'];

function MainApp() {
  const { currentUser, role, loading } = useAuth();
  // Page state lives in the navigation context so every page change is also
  // recorded in the browser history (Back / Forward / refresh friendly).
  const { activePage, setActivePage } = useNavigation();
  const [selectedCourseForAdmission, setSelectedCourseForAdmission] = useState('');
  const [activeCourseDetails, setActiveCourseDetails] = useState(null);

  const handleOpenCourseDetails = (course) => {
    setActiveCourseDetails(course);
    setActivePage('course-details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyCourse = (courseOrTitle) => {
    const title = typeof courseOrTitle === 'string' ? courseOrTitle : (courseOrTitle.courseName || courseOrTitle.title);
    setSelectedCourseForAdmission(title);
    setActivePage('admission');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPage = () => {
    // Show smooth loading spinner while checking persistent auth state
    if (loading && (activePage === 'student-dashboard' || activePage === 'admin-dashboard')) {
      return (
        <div className="py-24 text-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Resolving authentication session...</p>
        </div>
      );
    }

    switch (activePage) {
      case 'home':
        return (
          <Home
            setActivePage={setActivePage}
            onSelectCourse={handleOpenCourseDetails}
            onApplyCourse={handleApplyCourse}
            setSelectedCourseForAdmission={setSelectedCourseForAdmission}
          />
        );
      case 'about':
        return <About setActivePage={setActivePage} />;
      case 'courses':
        return (
          <Courses
            onSelectCourse={handleOpenCourseDetails}
            onApplyCourse={handleApplyCourse}
          />
        );
      case 'course-details':
        return (
          <CourseDetails
            course={activeCourseDetails}
            onBack={() => {
              setActivePage('courses');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onApply={handleApplyCourse}
          />
        );
      case 'fee-structure':
        return (
          <FeeStructure
            setActivePage={setActivePage}
            setSelectedCourseForAdmission={setSelectedCourseForAdmission}
          />
        );
      case 'admission':
        return (
          <Admission
            selectedCourseTitle={selectedCourseForAdmission}
            setActivePage={setActivePage}
          />
        );
      case 'contact':
        return <Contact />;
      case 'login':
        return <Login setActivePage={setActivePage} initialTab="student" />;
      case 'register':
        return <Register setActivePage={setActivePage} />;
      case 'forgot-password':
        return <ForgotPassword setActivePage={setActivePage} />;
      case 'student-dashboard':
        // Protected Student Route Guard
        if (!currentUser) {
          return <Login setActivePage={setActivePage} initialTab="student" />;
        }
        return <StudentDashboard setActivePage={setActivePage} />;
      case 'admin-dashboard':
        // Protected Admin Route Guard
        if (!currentUser || role !== 'admin') {
          return <Login setActivePage={setActivePage} initialTab="admin" />;
        }
        return <AdminDashboard setActivePage={setActivePage} />;
      case '404':
        return <NotFound setActivePage={setActivePage} />;
      default:
        return <NotFound setActivePage={setActivePage} />;
    }
  };

  // Shared back arrow: shown at the top-left of every inner page. Unknown URLs
  // render the 404 page (which has its own "Back to Home" button), so they are
  // excluded through KNOWN_PAGES.
  const showBackArrow =
    KNOWN_PAGES.includes(activePage) && !PAGES_WITH_OWN_BACK.includes(activePage);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Contact Header */}
      <TopHeader />

      {/* Main Navigation Bar */}
      <Navbar activePage={activePage} setActivePage={setActivePage} />

      {/* Main View Area */}
      <main className="flex-grow">
        {/* Back arrow - sits in normal flow directly below the navbar, so it can
            never overlap page headings, forms or other content. */}
        {showBackArrow && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <BackArrow />
          </div>
        )}

        {renderPage()}
      </main>

      {/* Footer */}
      <Footer setActivePage={setActivePage} />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <MainApp />
      </NavigationProvider>
    </AuthProvider>
  );
}

export default App;
