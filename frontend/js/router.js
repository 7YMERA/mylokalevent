/* History-API router — real /path URLs (no #hash). */

// Global navigation helper: push a new URL and render it.
function navigate(to) {
  if (!to) return;
  const url = new URL(to, location.origin);
  const target = url.pathname + url.search;
  if (target !== location.pathname + location.search) {
    history.pushState({}, '', target);
  }
  route();
}
window.navigate = navigate;

(() => {
  function route() {
    window.scrollTo(0, 0);
    const path = location.pathname || '/';
    const params = {};
    new URLSearchParams(location.search).forEach((v, k) => (params[k] = v));
    const seg = path.split('/').filter(Boolean);      // ["events","123"]

    // event detail: /events/:id
    if (seg[0] === 'events' && seg[1]) return Public.eventDetail(seg[1]);

    switch (path) {
      case '/':                 return Public.home();
      case '/events':           return Public.events(params);
      case '/catches':          return Public.catches();
      case '/spots':            return Public.spots();
      case '/sponsored':        return Public.sponsored();
      case '/news':             return Public.news();
      case '/login':            return Auth.login();
      case '/register':         return Auth.register();
      case '/create-event':     return Auth.createEvent();
      case '/profile':          return Auth.profile();
      case '/wallet':           return Auth.wallet();
      case '/saved':            return Auth.saved();
      case '/organizer':        return Dash.organizer();
      case '/advertiser':       return Dash.advertiser();
      case '/advertiser/new':   return Dash.newCampaign();
      case '/fisherman':        return Dash.fisherman();
      case '/admin':            return Dash.admin();
      case '/admin/pending-events': return Dash.pendingEvents();
      case '/admin/pending-ads':    return Dash.pendingAds();
      case '/admin/pending-spots':  return Dash.pendingSpots();
      case '/admin/audit':      return Dash.audit();
      case '/admin/users':      return Dash.users();
      default:
        UI.app().innerHTML = `<div class="container py-5">${UI.empty('Page not found.', 'compass')}
          <div class="text-center"><a href="/" class="btn btn-primary">Go Home</a></div></div>`;
    }
  }
  window.route = route;

  // Intercept clicks on internal links so they navigate without a full reload.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    // Only handle internal SPA paths (start with "/", not "//"), same-tab, non-API.
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    if (a.target === '_blank' || a.hasAttribute('download') || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  });

  function boot() {
    UI.renderNavbar();      // instant paint from the cached session
    route();
    // Refresh the cached user from the server and repaint the navbar. This keeps
    // the credit balance current after a full page reload — e.g. returning from
    // Stripe checkout after a wallet top-up, where the cached credits are stale.
    if (API.isAuthed()) API.syncUser().then(() => UI.renderNavbar()).catch(() => {});
  }

  window.addEventListener('popstate', route);
  window.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
