import { api, subscribeWithPolling } from '../config/api';

/**
 * Submits a new contact form enquiry to the API (`POST /api/enquiries`)
 */
export const submitEnquiry = async (formData) => {
  const payload = {
    name: formData.name || '',
    email: formData.email || '',
    phone: formData.phone || '',
    subject: formData.subject || 'General Inquiry',
    message: formData.message || ''
  };

  try {
    const saved = await api.post('/api/enquiries', payload);
    return saved;
  } catch (error) {
    console.error("Error submitting enquiry to API:", error);
    throw error;
  }
};

/**
 * Live-updating list of enquiries (Admin Dashboard).
 * The API is REST, so this polls every 10 seconds (see subscribeWithPolling)
 * and returns an unsubscribe function. `onError` (optional) surfaces fetch
 * failures to the dashboard UI instead of silently showing an empty list.
 */
export const subscribeEnquiries = (callback, onError) => {
  return subscribeWithPolling(
    async () => {
      const enquiries = await api.get('/api/enquiries');
      // Sort newest first
      return [...(enquiries || [])].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    },
    callback,
    {
      intervalMs: 10000,
      onError: (error) => {
        console.warn("Real-time enquiries listener notice:", error);
        if (onError) onError(error);
      }
    }
  );
};

/**
 * Marks an enquiry as Read
 */
export const markEnquiryRead = async (docId) => {
  if (!docId) return false;
  try {
    await api.patch(`/api/enquiries/${encodeURIComponent(docId)}/read`);
    return true;
  } catch (error) {
    console.error("Error marking enquiry read:", error);
    throw error;
  }
};

/**
 * Deletes an enquiry (Admin)
 */
export const deleteEnquiry = async (docId) => {
  if (!docId) return false;
  try {
    await api.delete(`/api/enquiries/${encodeURIComponent(docId)}`);
    return true;
  } catch (error) {
    console.error("Error deleting enquiry:", error);
    throw error;
  }
};
