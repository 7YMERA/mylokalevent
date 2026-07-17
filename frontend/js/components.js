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

  // Shimmer skeleton block(s) — a nicer "loading buffer" than a bare spinner.
  const skeleton = (h = 20, w = '100%', cls = '') => `<div class="skel ${cls}" style="height:${h}px;width:${w}"></div>`;

  // A grid of placeholder cards while data loads (used on dashboards/listings).
  function skeletonCards(n = 6, cols = 'col-md-4') {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += `<div class="${cols} mb-4"><div class="card p-2">
        ${skeleton(150, '100%', 'mb-2')}
        ${skeleton(16, '70%', 'mb-2')}
        ${skeleton(12, '40%')}
      </div></div>`;
    }
    return `<div class="row">${out}</div>`;
  }

  // KPI card skeleton row for dashboards.
  const skeletonKpis = (n = 4) => `<div class="row">${Array.from({ length: n }).map(() =>
    `<div class="col-6 col-lg-3 mb-3"><div class="card p-3">${skeleton(38, '60%', 'mb-2')}${skeleton(12, '80%')}</div></div>`
  ).join('')}</div>`;

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

  // Reusable image uploader. Renders a preview + "Upload image" button that
  // sends the file to /api/upload and stores the returned URL in a hidden input
  // (id = `${name}`). Read the chosen URL from that hidden input's value.
  function uploader(name, folder, opts = {}) {
    const val = opts.value || '';
    const shape = opts.round ? 'rounded-circle' : 'rounded';
    const size = opts.size || 72;
    return `<div class="d-flex align-items-center gap-2">
      <img id="${name}_preview" src="${esc(val)}" alt=""
           class="${shape} border ${val ? '' : 'd-none'}"
           style="width:${size}px;height:${size}px;object-fit:cover">
      <div class="${shape} border bg-light d-flex align-items-center justify-content-center text-muted ${val ? 'd-none' : ''}"
           id="${name}_ph" style="width:${size}px;height:${size}px"><i class="bi bi-image"></i></div>
      <div>
        <input type="hidden" id="${name}" value="${esc(val)}">
        <label class="btn btn-sm btn-outline-primary mb-0">
          <i class="bi bi-upload"></i> ${opts.label || 'Upload image'}
          <input type="file" accept="image/*" hidden onchange="UI.handleUpload(this,'${name}','${folder}')">
        </label>
        <div class="small text-muted mt-1" id="${name}_status">JPG/PNG/WEBP, max 5MB</div>
      </div>
    </div>`;
  }

  async function handleUpload(input, name, folder) {
    const file = input.files && input.files[0];
    if (!file) return;
    const status = document.getElementById(`${name}_status`);
    status.textContent = 'Uploading…';
    try {
      const { url } = await API.upload(file, folder);
      document.getElementById(name).value = url;
      const img = document.getElementById(`${name}_preview`);
      const ph = document.getElementById(`${name}_ph`);
      if (img) { img.src = url; img.classList.remove('d-none'); }
      if (ph) ph.classList.add('d-none');
      status.innerHTML = '<span class="text-success">Uploaded ✓</span>';
    } catch (e) {
      status.innerHTML = `<span class="text-danger">${esc(e.message)}</span>`;
    }
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
    const avatar = user.profile_image
      ? `<img src="${esc(user.profile_image)}" class="rounded-circle" style="width:26px;height:26px;object-fit:cover">`
      : '<i class="bi bi-person-circle"></i>';
    const bal = Number(user.credits || 0);
    nav.innerHTML = `
      <li class="nav-item"><a class="nav-link" href="#/wallet" title="Credit balance">
        <span class="badge bg-light text-primary"><i class="bi bi-wallet2"></i> RM${bal.toFixed(2)}</span></a></li>
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle d-flex align-items-center gap-1" href="#" data-bs-toggle="dropdown">
          ${avatar} ${esc(user.name)} <span class="badge bg-light text-primary">${esc(user.role)}</span>
        </a>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><a class="dropdown-item" href="#/profile"><i class="bi bi-person"></i> My Profile</a></li>
          <li><a class="dropdown-item" href="#/wallet"><i class="bi bi-wallet2"></i> Wallet <span class="text-muted">(RM${bal.toFixed(2)})</span></a></li>
          <li><a class="dropdown-item" href="${dashByRole[user.role] || '#/'}"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
          ${user.role === 'organizer' ? `<li><a class="dropdown-item" href="#/create-event"><i class="bi bi-plus-circle"></i> Post Event</a></li>
          <li><a class="dropdown-item" href="#/advertiser/new"><i class="bi bi-megaphone"></i> Create Ad</a></li>` : ''}
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
    STATES, renderNavbar, doLogout, requireRole, uploader, handleUpload, skeleton, skeletonCards, skeletonKpis };
})();
