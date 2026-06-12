/* Shared UI helpers: toasts, navbar, spinners, cards, formatters. */
const UI = (() => {
  const app = () => document.getElementById('app');

  function toast(msg, type = 'primary') {
    const box = document.getElementById('toastBox');
    const el = document.createElement('div');
    el.className = `toast align-items-center text-white bg-${type} border-0 show`;
    el.role = 'alert';
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  const spinner = () => `<div class="spinner-wrap"><div class="spinner-border" role="status"></div><p class="mt-2">Loading…</p></div>`;

  function empty(msg, icon = 'inbox') {
    return `<div class="text-center text-muted py-5"><i class="bi bi-${icon}" style="font-size:2.5rem"></i><p class="mt-2">${msg}</p></div>`;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (n) => `RM${Number(n || 0).toFixed(2)}`;
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (s) => s ? new Date(s).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  function statusBadge(status) {
    const map = { pending: 'badge-pending', live: 'badge-live', approved: 'badge-approved',
      active: 'badge-active', rejected: 'badge-rejected', expired: 'badge-expired' };
    return `<span class="badge ${map[status] || 'bg-secondary'} text-capitalize">${esc(status)}</span>`;
  }

  function eventCard(ev) {
    const img = ev.banner_url
      ? `<img src="${esc(ev.banner_url)}" class="event-thumb w-100" alt="">`
      : `<div class="event-thumb w-100 d-flex align-items-center justify-content-center text-primary"><i class="bi bi-calendar-event" style="font-size:2.5rem"></i></div>`;
    const fee = Number(ev.entry_fee) > 0 ? money(ev.entry_fee) : '<span class="text-success fw-bold">FREE</span>';
    return `<div class="col-md-4 mb-4"><div class="card card-hover h-100">
        <a href="#/events/${ev.id}">${img}</a>
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <span class="badge bg-light text-primary border"><i class="bi bi-geo-alt"></i> ${esc(ev.district)}, ${esc(ev.state)}</span>
            ${statusBadge(ev.status)}
          </div>
          <h5 class="mt-2"><a href="#/events/${ev.id}" class="text-dark">${esc(ev.title)}</a></h5>
          <p class="text-muted small mb-2"><i class="bi bi-calendar3"></i> ${fmtDate(ev.start_date)}</p>
          <div class="d-flex justify-content-between align-items-center">
            <span>${fee}</span>
            <span class="text-muted small"><i class="bi bi-eye"></i> ${ev.view_count || 0}</span>
          </div>
        </div></div></div>`;
  }

  // Malaysian states (+ a few districts for the demo dropdowns)
  const STATES = ['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang','Perak','Perlis',
    'Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu','Kuala Lumpur','Labuan','Putrajaya'];

  function renderNavbar() {
    const nav = document.getElementById('navAuth');
    const user = API.getUser();
    if (!user) {
      nav.innerHTML = `
        <li class="nav-item"><a class="nav-link" href="#/login">Login</a></li>
        <li class="nav-item"><a class="btn btn-light btn-sm text-primary fw-bold ms-lg-2 mt-1" href="#/register">Register</a></li>`;
      return;
    }
    const dashByRole = { organizer: '#/organizer', advertiser: '#/advertiser', fisherman: '#/fisherman', admin: '#/admin', user: '#/saved' };
    nav.innerHTML = `
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">
          <i class="bi bi-person-circle"></i> ${esc(user.name)} <span class="badge bg-light text-primary">${esc(user.role)}</span>
        </a>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><a class="dropdown-item" href="${dashByRole[user.role] || '#/'}"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
          ${user.role === 'organizer' ? '<li><a class="dropdown-item" href="#/create-event"><i class="bi bi-plus-circle"></i> Post Event</a></li>' : ''}
          <li><a class="dropdown-item" href="#/saved"><i class="bi bi-bookmark"></i> Saved Events</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger" href="#" onclick="UI.doLogout(event)"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
        </ul>
      </li>`;
  }

  async function doLogout(e) {
    e.preventDefault();
    await API.logout();
    renderNavbar();
    toast('Logged out');
    location.hash = '#/';
  }

  // Guard: redirect to login if not authed / wrong role. Returns the user or null.
  function requireRole(...roles) {
    const user = API.getUser();
    if (!user) { location.hash = '#/login'; return null; }
    if (roles.length && !roles.includes(user.role)) {
      app().innerHTML = `<div class="container py-5">${empty('You do not have access to this page.', 'lock')}</div>`;
      return null;
    }
    return user;
  }

  return { app, toast, spinner, empty, esc, money, fmtDate, fmtDateTime, statusBadge, eventCard,
    STATES, renderNavbar, doLogout, requireRole };
})();
