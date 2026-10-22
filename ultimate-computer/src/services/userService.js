import { api } from '../config/api';
import { changePassword } from './authService';

/**
 * User profile helpers backed by the API
 * (profile reads/writes go through /api/users with the Firebase ID token,
 * password changes go through Firebase Authentication — see authService.js.)
 */

/**
 * Retrieves a user profile (GET /api/users/:uid — own profile or admin)
 */
export const getUserProfile = async (uid) => {
  try {
    const profile = await api.get(`/api/users/${encodeURIComponent(uid)}`);
    return profile || null;
  } catch (error) {
    if (error.status === 404 || error.status === 403) return null;
    console.error("Error in getUserProfile:", error);
    return null;
  }
};

/**
 * Safely updates profile fields (fullName, mobile) via the API
 * CANNOT change uid or role!
 */
export const updateUserProfileData = async (uid, { fullName, mobile }) => {
  try {
    const payload = {};
    if (fullName !== undefined) payload.fullName = fullName;
    if (mobile !== undefined) payload.mobile = mobile;

    await api.patch(`/api/users/${encodeURIComponent(uid)}`, payload);
    return true;
  } catch (error) {
    console.error("Error in updateUserProfileData:", error);
    throw error;
  }
};

/**
 * Changes the CURRENT user's password.
 * Firebase Authentication re-verifies the current password first and then
 * applies the new one — the server is never asked to accept an unverified
 * password change (see authService.changePassword).
 * Kept signature (newPassword, currentPassword) used by the Student Dashboard.
 */
export const updateUserPassword = async (newPassword, currentPassword = '') => {
  try {
    await changePassword(currentPassword, newPassword);
    return true;
  } catch (error) {
    console.error("Error in updateUserPassword:", error);
    throw error;
  }
};
