/**
 * Response helper for API routes whose data store is still being migrated to
 * Cloud Firestore.
 *
 * Student profiles, courses, admission applications and contact enquiries are
 * all served from Firestore now. The routes that still answer with this
 * helper are the ones NOT part of that migration (admin user provisioning and
 * admin password resets).
 *
 * Every such route answers with an explicit 503 + machine-readable code
 * instead of pretending to succeed, so the frontend can show an honest
 * "temporarily unavailable" message.
 */

export const DATA_LAYER_MESSAGE =
  'This feature is temporarily unavailable while the backend data store is being migrated. Please try again later.';

/** Sends the canonical 503 response. */
export const dataLayerUnavailable = (res) =>
  res.status(503).json({ error: DATA_LAYER_MESSAGE, code: 'DATA_LAYER_UNAVAILABLE' });

/** Ready-made Express handler: always answers 503 DATA_LAYER_UNAVAILABLE. */
export const unavailable = (_req, res) => dataLayerUnavailable(res);
