import { api, subscribeWithPolling } from '../config/api';
import { coursesData } from '../data/coursesData';

const POLL_INTERVAL_MS = 15000;

/**
 * Reads local cached courses fallback (offline / instant paint while API loads)
 */
export const getLocalCourses = () => {
  try {
    const stored = localStorage.getItem('uc_courses');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("[CourseService] Local storage read error:", e);
  }
  return coursesData.map(c => ({ ...c, status: 'active' }));
};

/**
 * Writes to local cache
 */
const setLocalCoursesCache = (courses) => {
  try {
    localStorage.setItem('uc_courses', JSON.stringify(courses));
  } catch (e) {
    console.warn("[CourseService] Local storage write error:", e);
  }
};

/**
 * Ensures the default courses are available.
 * Calls the API's idempotent seed endpoint, which writes the bundled
 * catalogue into Cloud Firestore only while the courses collection is empty —
 * it never overwrites or resurrects stored courses.
 */
export const seedInitialCoursesIfEmpty = async () => {
  try {
    await api.post('/api/courses/seed', {});
  } catch (error) {
    console.warn("[CourseService] Seed error notice:", error);
  }
};

/**
 * Live-updating course list (public pages + Admin Course Management).
 * The API is REST, so this polls the server (same subscribe contract:
 * returns an unsubscribe function). Cached data is
 * emitted instantly on mount, then replaced by fresh server data.
 */
export const subscribeCourses = (callback, onError) => {
  // Instant paint from local cache so pages never flash empty
  const cached = getLocalCourses();
  if (cached && cached.length > 0) callback(cached);

  return subscribeWithPolling(
    async () => {
      const courses = await api.get('/api/courses');
      const normalized = (courses || []).map(c => ({
        ...c,
        status: c.status || 'active'
      }));
      // Sort by course name (same as before)
      normalized.sort((a, b) => (a.courseName || '').localeCompare(b.courseName || ''));
      return normalized;
    },
    (courses) => {
      setLocalCoursesCache(courses);
      callback(courses);
    },
    {
      intervalMs: POLL_INTERVAL_MS,
      onError: (error) => {
        console.warn("[CourseService] Subscription error notice:", error);
        if (onError) onError(error);
        // Fall back to cached data
        callback(getLocalCourses());
      }
    }
  );
};

/**
 * Adds a new course (POST /api/courses)
 */
export const addCourse = async (courseData) => {
  const payload = {
    courseName: courseData.courseName,
    shortDescription: courseData.shortDescription,
    detailedDescription: courseData.detailedDescription || courseData.shortDescription,
    duration: courseData.duration,
    fee: courseData.fee || courseData.totalFee || 'Contact Office',
    registrationFee: courseData.registrationFee || '[Included]',
    totalFee: courseData.totalFee || courseData.fee || 'Contact Office',
    eligibility: courseData.eligibility || 'Open to all',
    level: courseData.level || 'Beginner',
    category: courseData.category || 'Certified Program',
    imageUrl: courseData.imageUrl || '',
    status: courseData.status || 'active',
    modules: courseData.modules && courseData.modules.length > 0 ? courseData.modules : [
      {
        moduleNumber: '01',
        title: 'Core Program Syllabus',
        topics: [
          'Practical training and hands-on lab exercises.',
          'System setup, fundamentals, and tool applications.',
          'Project building and evaluation.'
        ],
        practicalWork: 'Real-world practical assignment and lab tasks.'
      }
    ],
    practicalTraining: courseData.practicalTraining && courseData.practicalTraining.length > 0 ? courseData.practicalTraining : [
      '100% Practical lab sessions with dedicated workstation.',
      'Guided instructor practice sessions and project reviews.'
    ],
    skillsCovered: courseData.skillsCovered && courseData.skillsCovered.length > 0 ? courseData.skillsCovered : [
      'Core IT Literacy',
      'Practical Skills',
      'Industry Readiness'
    ],
    careerOpportunities: courseData.careerOpportunities && courseData.careerOpportunities.length > 0 ? courseData.careerOpportunities : [
      'Technical Assistant',
      'Computer Operator',
      'Office Executive'
    ],
    courseHighlights: courseData.courseHighlights && courseData.courseHighlights.length > 0 ? courseData.courseHighlights : [
      'Certified curriculum',
      'Practical hands-on lab training'
    ],
    admissionInfo: courseData.admissionInfo || 'Contact helpline at +91 9422295496 for batch availability and enrolment.'
  };

  const saved = await api.post('/api/courses', payload);

  const local = getLocalCourses();
  setLocalCoursesCache([saved, ...local]);

  return saved;
};

/**
 * Updates an existing course (PUT /api/courses/:id)
 */
export const updateCourse = async (courseId, courseData) => {
  const updatePayload = {
    courseName: courseData.courseName,
    shortDescription: courseData.shortDescription,
    detailedDescription: courseData.detailedDescription || courseData.shortDescription,
    duration: courseData.duration,
    fee: courseData.fee || courseData.totalFee || 'Contact Office',
    registrationFee: courseData.registrationFee || '[Included]',
    totalFee: courseData.totalFee || courseData.fee || 'Contact Office',
    eligibility: courseData.eligibility || 'Open to all',
    level: courseData.level || 'Beginner',
    category: courseData.category || 'Certified Program',
    imageUrl: courseData.imageUrl || '',
    status: courseData.status || 'active'
  };

  if (courseData.modules) updatePayload.modules = courseData.modules;
  if (courseData.practicalTraining) updatePayload.practicalTraining = courseData.practicalTraining;
  if (courseData.skillsCovered) updatePayload.skillsCovered = courseData.skillsCovered;
  if (courseData.careerOpportunities) updatePayload.careerOpportunities = courseData.careerOpportunities;
  if (courseData.courseHighlights) updatePayload.courseHighlights = courseData.courseHighlights;

  if (courseId) {
    await api.put(`/api/courses/${encodeURIComponent(courseId)}`, updatePayload);
  }

  const local = getLocalCourses();
  const updated = local.map(c => (c.id === courseId ? { ...c, ...updatePayload } : c));
  setLocalCoursesCache(updated);

  return true;
};

/**
 * Deletes a course (DELETE /api/courses/:id)
 */
export const deleteCourse = async (courseId) => {
  if (courseId) {
    await api.delete(`/api/courses/${encodeURIComponent(courseId)}`);
  }

  const local = getLocalCourses();
  const updated = local.filter(c => c.id !== courseId);
  setLocalCoursesCache(updated);

  return true;
};
