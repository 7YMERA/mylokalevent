/* Runtime config — where the frontend finds the backend API.
 *
 * Local dev (localhost) → same origin ('') so it hits your local FastAPI.
 * Deployed (Vercel)     → the Render backend URL below.
 *
 * 👉 AFTER you create the Render service, replace the URL below with your real
 *    backend URL (e.g. https://mylokalevent.onrender.com). No trailing slash.
 */
window.MLE_API_BASE = (function () {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '') return '';
  // --- CHANGE THIS to your Render backend URL ---
  return 'https://mylokalevent.onrender.com';
})();
