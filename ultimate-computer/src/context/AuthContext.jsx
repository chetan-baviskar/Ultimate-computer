import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Session state for the whole app.
 *
 * Authentication is Firebase Authentication: `onAuthStateChanged` restores the
 * session on every page load (survives refresh/logout-free restarts of the tab)
 * and the student's profile is then fetched from the API with that user's ID
 * token (GET /api/auth/me — verified server-side with the Admin SDK).
 *
 * Role always comes from the stored Firestore profile, never from anything the
 * client sends.
 */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const clearSession = () => {
    setCurrentUser(null);
    setUserProfile(null);
    setRole(null);
    setProfileError(null);
  };

  // Restore / track the Firebase session for the lifetime of the page.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (!active) return;
        clearSession();
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      const uid = firebaseUser.uid;
      setProfileLoading(true);

      try {
        const profile = await authService.fetchCurrentUser();

        // The session may have changed (signed out, or a newer event won)
        // while the request was in flight — never apply a stale result.
        if (!active || auth.currentUser?.uid !== uid) return;

        if (profile) {
          const session = { ...profile, uid: profile.uid || uid, email: profile.email || firebaseUser.email };
          setCurrentUser(session);
          setUserProfile(profile);
          setRole(profile.role === 'admin' ? 'admin' : 'student');
          setProfileError(null);
        } else {
          // Firebase says "signed in" but there is no usable profile
          // (interrupted registration) — show the logged-out state rather than
          // a dashboard that cannot be filled with real data.
          clearSession();
        }
      } catch (error) {
        if (!active || auth.currentUser?.uid !== uid) return;
        // Backend unreachable: keep the signed-in identity so the UI can say
        // exactly what is wrong instead of silently dropping the session.
        console.warn('Session/profile restore notice:', error.message);
        setCurrentUser({ uid, email: firebaseUser.email, displayName: firebaseUser.displayName });
        setUserProfile(null);
        setRole(null);
        setProfileError(error.message || 'Your profile could not be loaded right now.');
      } finally {
        if (active) {
          setProfileLoading(false);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /** Applies a profile returned by the API after a successful login. */
  const applySession = (profile) => {
    const session = { ...profile, uid: profile.uid, email: profile.email };
    setCurrentUser(session);
    setUserProfile(profile);
    setRole(profile.role === 'admin' ? 'admin' : 'student');
    setProfileError(null);
    return session;
  };

  /**
   * Registers a new student account (Firebase Authentication + Firestore
   * profile via the API). After a successful registration the session is
   * cleared so the student signs in through the Student Login portal.
   */
  const registerStudent = async ({ email, password, fullName, mobile, course = '' }) => {
    setLoading(true);
    try {
      const profile = await authService.register({
        email: typeof email === 'string' ? email.trim() : email,
        password,
        fullName,
        mobile,
        course
      });

      await authService.logout();
      clearSession();
      return profile;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logs in a student and verifies the stored role is not an admin role.
   */
  const loginStudent = async (email, password) => {
    setLoading(true);
    try {
      const profile = await authService.login(
        typeof email === 'string' ? email.trim() : email,
        password
      );

      if (profile.role === 'admin') {
        await authService.logout();
        clearSession();
        const error = new Error('Role Mismatch: Admin accounts must use the Admin Login portal.');
        error.code = 'ROLE_MISMATCH';
        error.status = 403;
        throw error;
      }

      return applySession(profile);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logs in an admin user and verifies the stored role IS an admin role.
   * (The role is read from Firestore by the server — it is never taken from
   * the request, so nothing a client sends can grant administrative access.)
   */
  const loginAdmin = async (email, password) => {
    setLoading(true);
    try {
      const profile = await authService.login(
        typeof email === 'string' ? email.trim() : email,
        password
      );

      if (profile.role !== 'admin') {
        await authService.logout();
        clearSession();
        const error = new Error(
          'Access Denied: This account does not have administrative privileges.'
        );
        error.code = 'ACCESS_DENIED';
        error.status = 403;
        throw error;
      }

      return applySession(profile);
    } finally {
      setLoading(false);
    }
  };

  /** Signs out of Firebase Authentication and resets all local state. */
  const logout = async () => {
    await authService.logout();
    clearSession();
    setProfileLoading(false);
  };

  const value = {
    currentUser,
    userProfile,
    role,
    loading,
    profileLoading,
    profileError,
    registerStudent,
    loginStudent,
    loginAdmin,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
