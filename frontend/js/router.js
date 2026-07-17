/* Hash router — maps #/path?query to a view function. */
(() => {
  function parseHash() {
    const raw = location.hash.slice(1) || '/';        // e.g. "/events?state=Perak"
    const [path, queryStr] = raw.split('?');
    const params = {};
    new URLSearchParams(queryStr || '').forEach((v, k) => (params[k] = v));
    return { path, params };
  }

  function route() {
    window.scrollTo(0, 0);
    const { path, params } = parseHash();
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
      case '/admin/audit':      return Dash.audit();
      case '/admin/users':      return Dash.users();
      default:
        UI.app().innerHTML = `<div class="container py-5">${UI.empty('Page not found.', 'compass')}
          <div class="text-center"><a href="#/" class="btn btn-primary">Go Home</a></div></div>`;
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', () => { UI.renderNavbar(); route(); });
  // In case scripts load after DOMContentLoaded already fired:
  if (document.readyState !== 'loading') { UI.renderNavbar(); route(); }
})();
