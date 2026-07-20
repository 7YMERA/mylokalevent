/* Role dashboards: organizer, advertiser, fisherman, admin, audit, users. */
const Dash = (() => {
  const { app, spinner, empty, esc, money, fmtDate, fmtDateTime, statusBadge } = UI;
  let charts = [];
  function clearCharts() { charts.forEach(c => c.destroy()); charts = []; }

  // Classify an ad by where it is in its 7-day lifecycle so campaigns can be
  // grouped/filtered: active, expiring (≤2 days left), expired, or other
  // (pending / rejected). daysLeft is whole days until end_date.
  function adLifecycle(a) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let daysLeft = null;
    if (a.end_date) {
      const end = new Date(a.end_date); end.setHours(0, 0, 0, 0);
      daysLeft = Math.round((end - today) / 86400000);
    }
    let key;
    if (a.status === 'expired' || (daysLeft !== null && daysLeft < 0)) key = 'expired';
    else if (a.status === 'active' && daysLeft !== null && daysLeft <= 2) key = 'expiring';
    else if (a.status === 'active') key = 'active';
    else key = 'other';   // pending / rejected
    return { key, daysLeft };
  }

  // Filter the campaigns table by lifecycle group (wired to the filter tabs).
  function filterAds(btn, group) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#adTableBody tr[data-adgroup]').forEach(tr => {
      tr.style.display = (group === 'all' || tr.dataset.adgroup === group) ? '' : 'none';
    });
  }

  // Inner KPI card (no column wrapper) — lets it be wrapped in a link.
  function kpiInner(val, label, cls, icon) {
    return `<div class="kpi p-3 ${cls} h-100">
      <div class="d-flex justify-content-between"><div><div class="kpi-val">${val}</div><div class="small">${label}</div></div>
      <i class="bi bi-${icon}" style="font-size:1.8rem;opacity:.5"></i></div></div>`;
  }
  function kpi(val, label, cls, icon) {
    return `<div class="col-6 col-lg-3 mb-3">${kpiInner(val, label, cls, icon)}</div>`;
  }
  const shell = (title, sidebarActive, body) => {
    const u = API.getUser();
    const links = {
      organizer: [['/organizer','Dashboard','speedometer2'],
                  ['/create-event','Post Event','plus-circle'],
                  ['/advertiser/new','Create Ad','megaphone']],
      advertiser: [['/advertiser','Dashboard','speedometer2'],['/advertiser/new','New Campaign','plus-circle']],
      fisherman: [['/fisherman','Dashboard','speedometer2']],
      // 4th item (optional) = id for a live count badge
      admin: [['/admin','Dashboard','speedometer2'],
              ['/admin/pending-events','Pending Events','calendar-check','badgePendEvents'],
              ['/admin/pending-ads','Pending Ads','megaphone','badgePendAds'],
              ['/admin/audit','Audit Logs','shield-check'],
              ['/admin/users','Users','people']],
    }[u.role] || [];
    return `<div class="container-fluid py-4"><div class="row">
      <aside class="col-md-4 col-lg-2 mb-3 dash-sidebar">
        <div class="list-group">${links.map(([h,t,i,badge]) =>
          `<a href="${h}" class="list-group-item list-group-item-action border-0 nav-link d-flex align-items-center ${h===sidebarActive?'active':''}">
            <i class="bi bi-${i} me-2"></i> ${t}
            ${badge ? `<span id="${badge}" class="badge bg-danger rounded-pill ms-auto d-none"></span>` : ''}</a>`).join('')}</div>
      </aside>
      <div class="col-md-8 col-lg-10"><h3 class="mb-3">${title}</h3>${body}</div></div></div>`;
  };

  // Fetch pending counts and light up the sidebar badges (admin only).
  function setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.remove('d-none'); }
    else el.classList.add('d-none');
  }
  async function loadAdminBadges() {
    try {
      const [ev, ads] = await Promise.all([
        API.get('/admin/events/pending'), API.get('/admin/advertisements/pending')]);
      setBadge('badgePendEvents', ev.length);
      setBadge('badgePendAds', ads.length);
    } catch {}
  }

  // ---------- Left widget rail (replaces the nav sidebar) ----------
  // Centered avatar + name-below profile card (shared by the dashboard rails).
  // The avatar sits in a flex-centered wrapper so the image and the initial
  // fallback are centered identically.
  function profileCard(me) {
    const av = me.profile_image
      ? `<img src="${esc(me.profile_image)}" class="rounded-circle" style="width:80px;height:80px;object-fit:cover" alt="">`
      : `<div class="rounded-circle avatar-initial" style="width:80px;height:80px;font-size:1.8rem">${esc((me.name||'?').charAt(0).toUpperCase())}</div>`;
    return `<div class="card card-body text-center mb-3">
      <div class="d-flex justify-content-center mb-2">${av}</div>
      <h6 class="mb-0">${esc(me.name)}</h6>
      <div class="mb-2"><span class="badge bg-light text-primary border text-capitalize">${esc(me.role)}</span></div>
      <a href="/profile" class="btn btn-sm btn-outline-primary"><i class="bi bi-person"></i> View Profile</a>
    </div>`;
  }
  function quickActions() {
    return `<div class="card card-body mb-3">
      <h6 class="fw-bold small text-muted mb-2"><i class="bi bi-lightning-charge"></i> QUICK ACTIONS</h6>
      <div class="d-grid gap-2">
        <a href="/create-event" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> Post Event</a>
        <a href="/advertiser/new" class="btn btn-outline-primary btn-sm"><i class="bi bi-megaphone"></i> Create Ad</a>
        <a href="/advertiser" class="btn btn-outline-primary btn-sm"><i class="bi bi-collection"></i> Manage Campaigns</a>
        <a href="/saved" class="btn btn-outline-secondary btn-sm"><i class="bi bi-bookmark"></i> Saved Events</a>
        <a href="/" class="btn btn-outline-secondary btn-sm"><i class="bi bi-globe"></i> View Public Site</a>
      </div></div>`;
  }
  async function loadOrgNotifications() {
    const box = document.getElementById('notifWidget');
    if (!box) return;
    try {
      const list = await API.get('/me/notifications');
      const items = list.slice(0, 6).map(n => `
        <a href="#" onclick="Dash.readNotif(${n.id});return false"
           class="list-group-item list-group-item-action border-0 px-2 py-2 ${n.is_read ? '' : 'bg-light'}">
          <div class="d-flex justify-content-between">
            <span class="small fw-${n.is_read ? 'normal' : 'bold'}">${esc(n.title)}</span>
            ${n.is_read ? '' : '<span class="badge bg-primary rounded-pill" style="font-size:.55rem">new</span>'}
          </div>
          <div class="small text-muted">${esc((n.body || '').slice(0, 60))}</div>
          <div class="text-muted" style="font-size:.7rem">${fmtDate(n.created_at)}</div>
        </a>`).join('');
      box.innerHTML = `<div class="card-body pb-0"><h6 class="fw-bold small text-muted mb-2"><i class="bi bi-bell"></i> NOTIFICATIONS</h6></div>
        <div class="list-group list-group-flush">${items || `<div class="px-3 pb-3 small text-muted">No notifications yet.</div>`}</div>`;
    } catch (e) { box.innerHTML = `<div class="card-body small text-muted">Notifications unavailable.</div>`; }
  }
  async function readNotif(id) {
    try { await API.post(`/me/notifications/${id}/read`); loadOrgNotifications(); } catch {}
  }

  // ---------- Screen 7: Organizer (events + ad campaigns + widget rail) ----------
  async function organizer() {
    const u = UI.requireRole('organizer', 'admin'); if (!u) return;
    const me = API.getUser();
    app().innerHTML = `<div class="container-fluid py-4"><div class="row">
      <aside class="col-lg-3 mb-3">
        ${profileCard(me)}
        ${quickActions()}
        <div id="notifWidget" class="card">${UI.skeleton(140)}</div>
      </aside>
      <div class="col-lg-9" id="orgMain">
        ${UI.skeletonKpis(4)}<div class="card p-3 mt-2 mb-3">${UI.skeleton(200)}</div><div class="card p-3">${UI.skeleton(200)}</div>
      </div></div></div>`;
    loadOrgNotifications();
    try {
      const [d, ad] = await Promise.all([
        API.get('/me/organizer-summary'), API.get('/me/advertiser-summary')]);

      const eventRows = d.events.map(e => `<tr>
        <td><a href="/events/${e.id}">${esc(e.title)}</a></td>
        <td>${esc(e.district)}, ${esc(e.state)}</td>
        <td>${fmtDate(e.start_date)}</td><td>${statusBadge(e.status)}</td>
        <td class="text-center">${e.view_count||0}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="Dash.delEvent(${e.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('');

      const lc = ad.campaigns.map(adLifecycle);
      const nActive = lc.filter(x => x.key === 'active').length;
      const nExpiring = lc.filter(x => x.key === 'expiring').length;
      const nExpired = lc.filter(x => x.key === 'expired').length;

      const adRows = ad.campaigns.map((a, i) => {
        const L = lc[i];
        const renewBadge = a.auto_renew
          ? '<span class="badge bg-success"><i class="bi bi-arrow-repeat"></i> Auto-renew</span>'
          : '<span class="badge bg-light text-muted border"><i class="bi bi-slash-circle"></i> No auto-renew</span>';
        const expiringBadge = L.key === 'expiring'
          ? `<div class="mt-1"><span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split"></i> ${L.daysLeft <= 0 ? 'ends today' : L.daysLeft + 'd left'}</span></div>` : '';
        return `<tr data-adgroup="${L.key}">
          <td>${a.image_url ? `<img src="${esc(a.image_url)}" width="56" class="rounded">` : '<span class="text-muted">—</span>'}</td>
          <td>${esc(a.title)}
            <div class="small text-muted"><span class="text-capitalize">${esc(a.placement || 'featured')}</span>${a.event_title ? ' · → ' + esc(a.event_title) : ''}</div>
            <div class="mt-1">${renewBadge}</div></td>
          <td>${statusBadge(a.status)}${expiringBadge}</td>
          <td class="text-center">${a.impressions || 0}</td><td class="text-center">${a.clicks || 0}</td>
          <td class="text-center"><b>${a.ctr || 0}%</b></td>
          <td class="small text-nowrap">${a.end_date ? fmtDate(a.end_date) : '—'}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary" title="Send expiry reminder (demo)" onclick="Dash.remindAdExpiry(${a.id})"><i class="bi bi-bell"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.delAd(${a.id})"><i class="bi bi-trash"></i></button></td></tr>`;
      }).join('');

      document.getElementById('orgMain').innerHTML = `<h3 class="mb-3"><i class="bi bi-speedometer2 text-primary"></i> Organizer Dashboard</h3>
        <div class="row">
          ${kpi(d.total_events,'My Events','kpi-blue','calendar-event')}
          ${kpi(d.live,'Live Events','kpi-green','broadcast')}
          ${kpi(ad.active,'Active Ads','kpi-purple','megaphone')}
          ${kpi(d.total_views,'Total Views','kpi-orange','eye')}
        </div>

        <!-- Events -->
        <div class="d-flex justify-content-between align-items-center mt-3 mb-2">
          <h5 class="mb-0"><i class="bi bi-calendar-event text-primary"></i> My Events</h5>
          <a href="/create-event" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> Post Event</a></div>
        <div class="card mb-4"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Title</th><th>Location</th><th>Date</th><th>Status</th><th class="text-center">Views</th><th></th></tr></thead>
          <tbody>${eventRows || `<tr><td colspan="6">${empty('You have not posted any events yet.','calendar-x')}</td></tr>`}</tbody>
        </table></div></div>

        <!-- Ad campaigns -->
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h5 class="mb-0"><i class="bi bi-megaphone text-primary"></i> My Ad Campaigns</h5>
          <div class="d-flex gap-2">
            <a href="/advertiser" class="btn btn-outline-primary btn-sm"><i class="bi bi-megaphone"></i> Manage Campaigns</a>
            <a href="/advertiser/new" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> Create Ad</a></div></div>
        <div class="btn-group btn-group-sm mb-2 flex-wrap" role="group" aria-label="Filter campaigns">
          <button type="button" class="btn btn-outline-primary active" onclick="Dash.filterAds(this,'all')">All <span class="badge bg-secondary">${ad.campaigns.length}</span></button>
          <button type="button" class="btn btn-outline-success" onclick="Dash.filterAds(this,'active')">Active <span class="badge bg-success">${nActive}</span></button>
          <button type="button" class="btn btn-outline-warning" onclick="Dash.filterAds(this,'expiring')">Expiring soon <span class="badge bg-warning text-dark">${nExpiring}</span></button>
          <button type="button" class="btn btn-outline-secondary" onclick="Dash.filterAds(this,'expired')">Expired <span class="badge bg-secondary">${nExpired}</span></button>
        </div>
        <div class="row">
          <div class="col-lg-8"><div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
            <thead class="table-light"><tr><th>Banner</th><th>Title</th><th>Status</th><th class="text-center">Impr.</th><th class="text-center">Clicks</th><th class="text-center">CTR</th><th>Ends</th><th></th></tr></thead>
            <tbody id="adTableBody">${adRows || `<tr><td colspan="8">${empty('No ad campaigns yet.','megaphone')}</td></tr>`}</tbody></table></div></div></div>
          <div class="col-lg-4"><div class="card card-body"><h6>Clicks by Campaign</h6><canvas id="adChart" height="200"></canvas></div></div>
        </div>`;

      clearCharts();
      if (ad.campaigns.length) {
        charts.push(new Chart(document.getElementById('adChart'), { type: 'bar',
          data: { labels: ad.campaigns.map(c => c.title.slice(0,12)), datasets: [{ label:'Clicks', data: ad.campaigns.map(c=>c.clicks||0), backgroundColor:'#1B6CA8' }] },
          options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } }));
      }
    } catch (e) { document.getElementById('orgMain').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function delAd(id) {
    if (!confirm('Delete this campaign?')) return;
    try { await API.del(`/advertisements/${id}`); UI.toast('Campaign deleted','success'); organizer(); }
    catch (e) { UI.toast(e.message,'danger'); }
  }
  async function remindAdExpiry(id) {
    try { await API.post(`/advertisements/${id}/remind-expiry`); UI.toast('Expiry reminder email sent','success'); }
    catch (e) { UI.toast(e.message,'danger'); }
  }
  async function delEvent(id) {
    if (!confirm('Delete this event?')) return;
    try { await API.del(`/events/${id}`); UI.toast('Event deleted','success'); organizer(); }
    catch (e) { UI.toast(e.message,'danger'); }
  }

  // ---------- Screen 10: Advertiser ----------
  async function advertiser() {
    const u = UI.requireRole('organizer', 'admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-megaphone text-primary"></i> My Ad Campaigns', '/advertiser',
      UI.skeletonKpis(4) + `<div class="card p-3 mt-2">${UI.skeleton(240)}</div>`);
    try {
      const d = await API.get('/me/advertiser-summary');
      const lc = d.campaigns.map(adLifecycle);
      const nActive = lc.filter(x => x.key === 'active').length;
      const nExpiring = lc.filter(x => x.key === 'expiring').length;
      const nExpired = lc.filter(x => x.key === 'expired').length;
      const rows = d.campaigns.map((a, i) => {
        const L = lc[i];
        const renewBadge = a.auto_renew
          ? '<span class="badge bg-success"><i class="bi bi-arrow-repeat"></i> Auto-renew</span>'
          : '<span class="badge bg-light text-muted border"><i class="bi bi-slash-circle"></i> No auto-renew</span>';
        const expiringBadge = L.key === 'expiring'
          ? `<div class="mt-1"><span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split"></i> ${L.daysLeft <= 0 ? 'ends today' : L.daysLeft + 'd left'}</span></div>` : '';
        return `<tr data-adgroup="${L.key}">
          <td>${a.image_url ? `<img src="${esc(a.image_url)}" width="60" class="rounded">` : '<span class="text-muted">—</span>'}</td>
          <td>${esc(a.title)}<div class="mt-1">${renewBadge}</div></td>
          <td>${statusBadge(a.status)}${expiringBadge}</td>
          <td class="text-center">${a.impressions || 0}</td><td class="text-center">${a.clicks || 0}</td>
          <td class="text-center"><b>${a.ctr || 0}%</b></td><td class="small text-nowrap">${a.end_date ? fmtDate(a.end_date) : '—'}</td></tr>`;
      }).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-megaphone text-primary"></i> My Ad Campaigns</h3>
        <div class="row">
          ${kpi(d.total_campaigns,'Campaigns','kpi-blue','collection')}
          ${kpi(d.active,'Active','kpi-green','broadcast')}
          ${kpi(d.total_impressions,'Impressions','kpi-purple','eye')}
          ${kpi(d.total_clicks,'Clicks','kpi-orange','hand-index')}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3 mb-2">
          <h5 class="mb-0">My Campaigns</h5><a href="/advertiser/new" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> New Campaign</a></div>
        <div class="btn-group btn-group-sm mb-2 flex-wrap" role="group" aria-label="Filter campaigns">
          <button type="button" class="btn btn-outline-primary active" onclick="Dash.filterAds(this,'all')">All <span class="badge bg-secondary">${d.campaigns.length}</span></button>
          <button type="button" class="btn btn-outline-success" onclick="Dash.filterAds(this,'active')">Active <span class="badge bg-success">${nActive}</span></button>
          <button type="button" class="btn btn-outline-warning" onclick="Dash.filterAds(this,'expiring')">Expiring soon <span class="badge bg-warning text-dark">${nExpiring}</span></button>
          <button type="button" class="btn btn-outline-secondary" onclick="Dash.filterAds(this,'expired')">Expired <span class="badge bg-secondary">${nExpired}</span></button>
        </div>
        <div class="row"><div class="col-lg-7"><div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Banner</th><th>Title</th><th>Status</th><th class="text-center">Impr.</th><th class="text-center">Clicks</th><th class="text-center">CTR</th><th>Ends</th></tr></thead>
          <tbody id="adTableBody">${rows || `<tr><td colspan="7">${empty('No campaigns yet.','megaphone')}</td></tr>`}</tbody></table></div></div></div>
          <div class="col-lg-5"><div class="card card-body"><h6>Clicks by Campaign</h6><canvas id="adChart" height="200"></canvas></div></div></div>`;
      clearCharts();
      if (d.campaigns.length) {
        charts.push(new Chart(document.getElementById('adChart'), { type: 'bar',
          data: { labels: d.campaigns.map(c => c.title.slice(0,12)), datasets: [{ label:'Clicks', data: d.campaigns.map(c=>c.clicks||0), backgroundColor:'#1B6CA8' }] },
          options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } }));
      }
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }

  const PLACEMENT_INFO = {
    top: 'Top banner — shows across the top of every page (most visible)',
    sponsored: 'Sponsored page — featured on the dedicated Sponsored page',
    featured: 'Featured card — appears in event listings & homepage',
    feed: 'Community feed post — a native sponsored post in the feed',
    side: 'Side banner — shows in the events sidebar',
  };
  async function newCampaign() {
    const u = UI.requireRole('organizer','admin'); if (!u) return;
    let prices = { side: 40, feed: 50, featured: 70, sponsored: 90, top: 130 };
    try { prices = (await API.get('/advertisements/pricing')).placements; } catch {}
    Dash._adPrices = prices;
    let myEvents = [];
    try { myEvents = (await API.get('/me/organizer-summary')).events || []; } catch {}
    const opts = ['top', 'sponsored', 'featured', 'feed', 'side']
      .map(p => `<option value="${p}" ${p === 'featured' ? 'selected' : ''}>${PLACEMENT_INFO[p]} — RM${prices[p]}</option>`).join('');
    // Only LIVE events can be promoted — sending traffic to an expired or
    // still-pending event page makes no sense.
    const liveEvents = myEvents.filter(e => e.status === 'live');
    const eventOpts = liveEvents.map(e => `<option value="${e.id}">${esc(e.title.slice(0, 45))}</option>`).join('');
    app().innerHTML = shell('New Campaign','/advertiser/new', `<div class="col-lg-8">
      <form onsubmit="Dash.submitAd(event)">
        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-card-text text-primary"></i> Campaign Details</h6>
          <div class="mb-3"><label class="form-label required">Title / Headline</label>
            <input id="adTitle" class="form-control" maxlength="200" required placeholder="e.g. Join Kejohanan Memancing Kuantan 2026!"></div>
          <div class="mb-3"><label class="form-label">Description</label>
            <textarea id="adDesc" class="form-control" rows="3" maxlength="500" placeholder="Describe your event…"></textarea></div>
          <div class="mb-3"><label class="form-label"><i class="bi bi-megaphone"></i> Promote which event?</label>
            <select id="adEvent" class="form-select">
              <option value="">— none (use external link below) —</option>${eventOpts}</select>
            <div class="form-text">${liveEvents.length
              ? 'Only your <b>live</b> events are listed. Clicking this ad takes visitors straight to the event\'s page.'
              : 'You have no live events to promote yet — use an external link below, or post an event first.'}</div></div>
          <div class="mb-1"><label class="form-label">Or external link (optional)</label>
            <input id="adUrl" class="form-control" placeholder="https://yourshop.com — used only if no event selected"></div>
        </div>

        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-image text-primary"></i> Banner Artwork</h6>
          <p class="small text-muted">Recommended 1200×300px.</p>
          ${UI.uploader('adImg', 'ads', { size: 90, label: 'Upload banner' })}
        </div>

        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-badge-ad text-primary"></i> Placement &amp; Pricing</h6>
          <div class="mb-3"><label class="form-label required">Where should it show?</label>
            <select id="adPlacement" class="form-select" onchange="Dash.updateAdFee()">${opts}</select></div>
          <div class="alert alert-primary py-2"><i class="bi bi-tag"></i> This ad: <b id="adFeeText">RM70</b> for a 7-day run.
            <span class="text-muted">Runs from today; renew or auto-renew to continue.</span></div>
          <div class="form-check form-switch mb-3">
            <input class="form-check-input" type="checkbox" id="adAutoRenew">
            <label class="form-check-label" id="adAutoRenewLabel" for="adAutoRenew"><b>Auto-renew</b> — charge the fee in credits every 7 days (stops when credits run out)</label>
          </div>
          <label class="form-label">Pay with:</label>
          <div class="form-check"><input class="form-check-input" type="radio" name="adpay" id="adpayCredits" value="credits">
            <label class="form-check-label" id="adpayCreditsLabel" for="adpayCredits">Credits</label></div>
          <div class="form-check"><input class="form-check-input" type="radio" name="adpay" id="adpayCard" value="card" checked>
            <label class="form-check-label" for="adpayCard">Card via Stripe</label></div>
        </div>

        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-person-lines-fill text-primary"></i> Contact (optional)</h6>
          <div class="row">
            <div class="col-md-6 mb-2"><input id="adEmail" type="email" class="form-control" placeholder="Contact email"></div>
            <div class="col-md-6 mb-2"><input id="adPhone" class="form-control" placeholder="Contact phone"></div>
          </div>
        </div>

        <button class="btn btn-success" id="adBtn"><i class="bi bi-credit-card"></i> Create &amp; Pay RM70</button>
      </form></div>`);
    updateAdFee();
  }
  function updateAdFee() {
    const p = document.getElementById('adPlacement').value;
    const fee = Number((Dash._adPrices || {})[p] || 70);
    const bal = Number((API.getUser() || {}).credits || 0);
    document.getElementById('adFeeText').textContent = 'RM' + fee.toFixed(0);
    document.getElementById('adBtn').innerHTML = `<i class="bi bi-credit-card"></i> Create & Pay RM${fee.toFixed(0)}`;
    document.getElementById('adAutoRenewLabel').innerHTML = `<b>Auto-renew</b> — charge RM${fee.toFixed(0)} in credits every 7 days (stops when credits run out)`;
    const cr = document.getElementById('adpayCredits');
    cr.disabled = bal < fee;
    document.getElementById('adpayCreditsLabel').innerHTML =
      `Credits — RM${fee.toFixed(0)} <span class="text-muted">(balance: RM${bal.toFixed(2)})</span>` + (bal < fee ? ' <span class="text-danger">insufficient</span>' : '');
    if (bal < fee) document.getElementById('adpayCard').checked = true;
  }
  async function submitAd(e) {
    e.preventDefault();
    const btn = document.getElementById('adBtn'); btn.disabled = true; btn.textContent='Processing…';
    const payWith = document.querySelector('input[name="adpay"]:checked')?.value || 'card';
    try {
      const res = await API.post('/advertisements?pay_with=' + payWith, {
        title: document.getElementById('adTitle').value,
        description: document.getElementById('adDesc').value || null,
        image_url: document.getElementById('adImg').value || null,
        event_id: +document.getElementById('adEvent').value || null,
        target_url: document.getElementById('adUrl').value || null,
        placement: document.getElementById('adPlacement').value,
        contact_email: document.getElementById('adEmail').value || null,
        contact_phone: document.getElementById('adPhone').value || null,
        auto_renew: document.getElementById('adAutoRenew').checked });
      if (res.payment && res.payment.payment_url) { window.location.href = res.payment.payment_url; return; }
      if (payWith === 'credits') { await API.syncUser(); UI.renderNavbar(); }
      UI.toast('Campaign created! Awaiting admin approval.','success'); navigate('/organizer');
    } catch (err) { UI.toast(err.message,'danger'); btn.disabled=false; btn.innerHTML='<i class="bi bi-credit-card"></i> Create & Pay'; }
  }

  // ---------- Fisherman ----------
  async function fisherman() {
    const u = UI.requireRole('fisherman','admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-fish text-primary"></i> Fishermen Co-op Dashboard','/fisherman',
      UI.skeletonKpis(3) + `<div class="card p-3 mt-2">${UI.skeleton(240)}</div>`);
    try {
      const d = await API.get('/me/fisherman-summary');
      const rows = d.catches.map(c => `<tr><td>${esc(c.species)}</td><td>${c.weight_kg} kg</td><td>${money(c.price_per_kg)}/kg</td>
        <td>${esc(c.location||'—')}</td><td>${c.is_available?'<span class="badge badge-active">Available</span>':'<span class="badge badge-expired">Sold</span>'}</td>
        <td>${c.is_available?`<button class="btn btn-sm btn-outline-success" onclick="Dash.markSold(${c.id})">Mark Sold</button>`:''}
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.delCatch(${c.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-fish text-primary"></i> Fishermen Co-op Dashboard</h3>
        <div class="row">${kpi(d.total_listings,'Listings','kpi-blue','list-ul')}${kpi(d.available,'Available','kpi-green','box-seam')}${kpi(d.sold,'Sold','kpi-orange','check2-circle')}</div>
        <div class="row mt-2"><div class="col-lg-5"><div class="card card-body">
          <h6>Post a Catch</h6>
          <form onsubmit="Dash.submitCatch(event)">
            <input id="fcSpecies" class="form-control form-control-sm mb-2" placeholder="Species (e.g. Tuna)" required>
            <div class="row g-2"><div class="col"><input id="fcWeight" type="number" step="0.1" class="form-control form-control-sm mb-2" placeholder="Weight kg" required></div>
              <div class="col"><input id="fcPrice" type="number" step="0.1" class="form-control form-control-sm mb-2" placeholder="RM/kg" required></div></div>
            <input id="fcLoc" class="form-control form-control-sm mb-2" placeholder="Location / port">
            <input id="fcDate" type="date" class="form-control form-control-sm mb-2">
            <div class="mb-2">${UI.uploader('fcImg', 'catches', { size: 56, label: 'Add photo' })}</div>
            <button class="btn btn-primary btn-sm w-100">Post Catch</button>
          </form></div></div>
          <div class="col-lg-7"><div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
            <thead class="table-light"><tr><th>Species</th><th>Weight</th><th>Price</th><th>Location</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6">${empty('No catches posted.','fish')}</td></tr>`}</tbody></table></div></div></div></div>`;
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function submitCatch(e) {
    e.preventDefault();
    try {
      await API.post('/fish-catches', { species: document.getElementById('fcSpecies').value,
        weight_kg:+document.getElementById('fcWeight').value, price_per_kg:+document.getElementById('fcPrice').value,
        location: document.getElementById('fcLoc').value || null, catch_date: document.getElementById('fcDate').value || null,
        image_url: document.getElementById('fcImg').value || null });
      UI.toast('Catch posted!','success'); fisherman();
    } catch (err) { UI.toast(err.message,'danger'); }
  }
  async function markSold(id){ try{ await API.post(`/fish-catches/${id}/sold`); UI.toast('Marked sold','success'); fisherman(); }catch(e){UI.toast(e.message,'danger');} }
  async function delCatch(id){ if(!confirm('Delete listing?'))return; try{ await API.del(`/fish-catches/${id}`); fisherman(); }catch(e){UI.toast(e.message,'danger');} }

  // ---------- Screen 5: Admin dashboard ----------
  async function admin() {
    const u = UI.requireRole('admin'); if (!u) return;
    // Show a realistic loading buffer (skeleton) while data streams in.
    app().innerHTML = shell('<i class="bi bi-speedometer2 text-primary"></i> Admin Dashboard', '/admin',
      UI.skeletonKpis(4) + UI.skeletonKpis(4) + `<div class="row">
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
      </div>${UI.skeleton(180, '100%')}`);
    loadAdminBadges();
    try {
      const [d, byState, byCat, revenue] = await Promise.all([
        API.get('/analytics/dashboard'), API.get('/analytics/events-by-state'),
        API.get('/analytics/events-by-category'), API.get('/analytics/revenue-monthly') ]);
      // Secondary panels — degrade gracefully if any single call fails.
      const [adCtr, catchTrends, audit, usersList] = await Promise.all([
        API.get('/analytics/ad-ctr').catch(() => []),
        API.get('/analytics/catch-trends').catch(() => []),
        API.get('/analytics/audit-logs?page_size=8').catch(() => ({ items: [] })),
        API.get('/admin/users').catch(() => []),
      ]);
      const recent = audit.items || [];
      const totalClicks = adCtr.reduce((s, a) => s + (a.clicks || 0), 0);
      const totalImpr = adCtr.reduce((s, a) => s + (a.impressions || 0), 0);
      const avgCtr = totalImpr ? ((totalClicks / totalImpr) * 100).toFixed(1) + '%' : '0%';
      const newest = [...usersList].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 8);

      const topAds = adCtr.slice(0, 6).map(a => `<tr>
        <td class="small">${esc((a.label || '').slice(0, 32))}</td>
        <td class="small text-end">${a.clicks || 0}</td>
        <td class="small text-end">${a.impressions || 0}</td>
        <td class="small text-end fw-bold">${a.ctr || 0}%</td></tr>`).join('')
        || `<tr><td colspan="4" class="small text-muted">No ad data yet.</td></tr>`;

      const activity = recent.map(l => `<div class="d-flex align-items-start gap-2 py-1 border-bottom">
        <span class="act-${esc(l.action)} fw-bold small" style="min-width:64px">${esc(l.action)}</span>
        <div class="small flex-grow-1"><span class="fw-semibold">${esc(l.user_name || '—')}</span>
          <span class="text-muted">${esc(l.table_name || '')}${l.record_id ? ` #${l.record_id}` : ''}</span>
          <div class="text-muted" style="font-size:.7rem">${fmtDateTime(l.created_at)}</div></div></div>`).join('')
        || '<div class="small text-muted">No recent activity.</div>';

      const members = newest.map(m => `<tr>
        <td>${esc(m.name)}</td><td class="small text-muted">${esc(m.email)}</td>
        <td><span class="badge bg-light text-primary border text-capitalize">${esc(m.role)}</span></td>
        <td class="small">${fmtDate(m.created_at)}</td></tr>`).join('')
        || `<tr><td colspan="4" class="small text-muted">No users yet.</td></tr>`;

      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-speedometer2 text-primary"></i> Admin Dashboard</h3>
        <div class="row">
          ${kpi(d.total_events,'Total Events','kpi-blue','calendar-event')}
          <a href="/admin/pending-events" class="col-6 col-lg-3 mb-3 text-decoration-none">${kpiInner(d.pending_approvals,'Pending Events','kpi-orange','hourglass-split')}</a>
          ${kpi(money(d.total_revenue),'Revenue','kpi-green','cash-stack')}
          ${kpi(d.active_ads,'Active Ads','kpi-purple','megaphone')}
        </div>
        <div class="row">
          ${kpi(d.total_users,'Total Users','kpi-blue','people')}
          ${kpi(d.total_catches,'Fish Catches','kpi-green','water')}
          ${kpi(d.total_payments,'Payments','kpi-orange','receipt')}
          ${kpi(avgCtr,'Avg Ad CTR','kpi-purple','graph-up-arrow')}
        </div>
        <div class="row">
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Events by State</h6><div style="height:240px"><canvas id="cState"></canvas></div></div></div>
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Monthly Revenue</h6><div style="height:240px"><canvas id="cRev"></canvas></div></div></div>
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Events by Category</h6><div style="height:240px"><canvas id="cCat"></canvas></div></div></div>
        </div>
        <div class="row">
          <div class="col-lg-5 mb-3"><div class="card card-body">
            <h6><i class="bi bi-megaphone text-primary"></i> Top Ad Campaigns</h6>
            <div class="table-responsive"><table class="table table-sm mb-0 align-middle">
              <thead class="table-light"><tr><th>Campaign</th><th class="text-end">Clicks</th><th class="text-end">Impr.</th><th class="text-end">CTR</th></tr></thead>
              <tbody>${topAds}</tbody></table></div></div></div>
          <div class="col-lg-3 mb-3"><div class="card card-body"><h6><i class="bi bi-water text-primary"></i> Catch Landings (kg)</h6><div style="height:240px"><canvas id="cCatch"></canvas></div></div></div>
          <div class="col-lg-4 mb-3"><div class="card card-body">
            <h6><i class="bi bi-activity text-primary"></i> Recent Activity</h6>
            <div style="max-height:250px;overflow:auto">${activity}</div></div></div>
        </div>
        <div class="card card-body mb-3">
          <div class="d-flex justify-content-between align-items-center">
            <h6 class="mb-0"><i class="bi bi-person-plus text-primary"></i> Newest Members</h6>
            <a href="/admin/users" class="btn btn-sm btn-outline-primary">Manage all</a></div>
          <div class="table-responsive mt-2"><table class="table table-sm table-hover mb-0 align-middle">
            <thead class="table-light"><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>${members}</tbody></table></div></div>`;
      clearCharts();
      charts.push(new Chart(document.getElementById('cState'), { type:'bar',
        data:{ labels: byState.map(x=>x.label), datasets:[{data:byState.map(x=>x.value), backgroundColor:'#1B6CA8'}]},
        options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}));
      charts.push(new Chart(document.getElementById('cRev'), { type:'line',
        data:{ labels: revenue.map(x=>x.label), datasets:[{data:revenue.map(x=>x.value), borderColor:'#28A745', backgroundColor:'rgba(40,167,69,.1)', fill:true, tension:.3}]},
        options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}));
      charts.push(new Chart(document.getElementById('cCat'), { type:'doughnut',
        data:{ labels: byCat.map(x=>x.label), datasets:[{data:byCat.map(x=>x.value), backgroundColor:['#1B6CA8','#2E75B6','#28A745','#FD7E14','#845ef7','#DC3545']}]},
        options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:10}}}}}}));
      if (catchTrends.length) charts.push(new Chart(document.getElementById('cCatch'), { type:'bar',
        data:{ labels: catchTrends.map(x=>x.label), datasets:[{data:catchTrends.map(x=>x.value), backgroundColor:'#17A2B8'}]},
        options:{maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}}));
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function approve(id){ try{ await API.post(`/admin/events/${id}/approve`); UI.toast('Event approved & published','success'); pendingEvents(); }catch(e){UI.toast(e.message,'danger');} }
  async function reject(id){ const r = prompt('Reason for rejection:'); if(!r)return; try{ await API.post(`/admin/events/${id}/reject`,{reason:r}); UI.toast('Event rejected','warning'); pendingEvents(); }catch(e){UI.toast(e.message,'danger');} }
  async function approveAd(id){ try{ await API.post(`/admin/advertisements/${id}/approve`); UI.toast('Ad approved & now running','success'); pendingAds(); }catch(e){UI.toast(e.message,'danger');} }
  async function rejectAd(id){ const r = prompt('Reason for rejection:'); if(!r)return; try{ await API.post(`/admin/advertisements/${id}/reject`,{reason:r}); UI.toast('Ad rejected','warning'); pendingAds(); }catch(e){UI.toast(e.message,'danger');} }

  // ---------- Pending Events (sidebar page) ----------
  async function pendingEvents() {
    const u = UI.requireRole('admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-calendar-check text-primary"></i> Pending Events', '/admin/pending-events',
      `<div class="card p-3">${UI.skeleton(300)}</div>`);
    loadAdminBadges();
    try {
      const pending = await API.get('/admin/events/pending');
      const rows = pending.map(e => `<tr><td><a href="/events/${e.id}">${esc(e.title)}</a></td>
        <td>${esc(e.district)}, ${esc(e.state)}</td><td>${fmtDate(e.start_date)}</td>
        <td class="text-nowrap"><button class="btn btn-sm btn-success" onclick="Dash.approve(${e.id})"><i class="bi bi-check-lg"></i> Approve</button>
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.reject(${e.id})">Reject</button></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-calendar-check text-primary"></i> Pending Events <span class="badge bg-warning">${pending.length}</span></h3>
        <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Title</th><th>Location</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4">${empty('No events awaiting approval. 🎉','check2-circle')}</td></tr>`}</tbody></table></div></div>`;
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }

  // ---------- Pending Ads (sidebar page) ----------
  async function pendingAds() {
    const u = UI.requireRole('admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-megaphone text-primary"></i> Pending Ads', '/admin/pending-ads',
      `<div class="card p-3">${UI.skeleton(300)}</div>`);
    loadAdminBadges();
    try {
      const ads = await API.get('/admin/advertisements/pending');
      const rows = ads.map(a => `<tr>
        <td>${a.image_url ? `<img src="${esc(a.image_url)}" width="90" class="rounded">` : '<span class="text-muted">—</span>'}</td>
        <td>${esc(a.title)}<div class="small text-muted">${esc((a.description || '').slice(0, 80))}</div></td>
        <td class="small">${esc(a.contact_email || '')}${a.contact_phone ? '<br>' + esc(a.contact_phone) : ''}</td>
        <td class="text-nowrap"><button class="btn btn-sm btn-success" onclick="Dash.approveAd(${a.id})"><i class="bi bi-check-lg"></i> Approve</button>
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.rejectAd(${a.id})">Reject</button></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-megaphone text-primary"></i> Pending Ads <span class="badge bg-warning">${ads.length}</span></h3>
        <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Banner</th><th>Campaign</th><th>Contact</th><th>Action</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4">${empty('No ads awaiting approval.','megaphone')}</td></tr>`}</tbody></table></div></div>`;
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }

  // ---------- Screen 6: Audit log viewer ----------
  async function audit() {
    const u = UI.requireRole('admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-shield-check text-primary"></i> Audit Logs','/admin/audit', `
      <div class="card card-body mb-3"><form class="row g-2 align-items-end" onsubmit="Dash.loadAudit(event)">
        <div class="col-auto"><label class="form-label small">Action</label>
          <select id="aAction" class="form-select form-select-sm"><option value="">All</option>
            ${['CREATE','UPDATE','DELETE','APPROVE','REJECT','LOGIN','LOGOUT','LOGIN_FAILED','EXPORT'].map(a=>`<option>${a}</option>`).join('')}</select></div>
        <div class="col-auto"><label class="form-label small">User ID (optional)</label><input id="aUser" type="number" class="form-control form-control-sm" style="width:120px"></div>
        <div class="col-auto"><button class="btn btn-primary btn-sm">Filter</button></div>
        <div class="col-auto"><a href="/api/analytics/audit-logs/export" class="btn btn-outline-success btn-sm" id="aExport"><i class="bi bi-download"></i> Export CSV</a></div>
      </form></div>
      <div class="card"><div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">
        <thead class="table-light"><tr><th>Time</th><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>IP</th></tr></thead>
        <tbody id="auditBody">${spinner()}</tbody></table></div></div>`);
    // Export needs auth header — fetch as blob
    document.getElementById('aExport').onclick = Dash.exportAudit;
    loadAdminBadges();
    loadAudit();
  }
  async function loadAudit(e) {
    if (e) e.preventDefault();
    const action = document.getElementById('aAction')?.value || '';
    const user_id = document.getElementById('aUser')?.value || '';
    try {
      const data = await API.get('/analytics/audit-logs' + API.qs({ action, user_id, page_size: 100 }));
      document.getElementById('auditBody').innerHTML = data.items.length ? data.items.map(l => `<tr>
        <td class="small">${fmtDateTime(l.created_at)}</td>
        <td class="small"><div class="fw-semibold">${esc(l.user_name || '—')}</div>
          <div class="text-muted">${esc(l.user_email || '')}</div></td>
        <td><span class="act-${esc(l.action)} fw-bold small">${esc(l.action)}</span></td>
        <td class="small">${esc(l.table_name||'—')}</td><td>${l.record_id ?? '—'}</td>
        <td class="small text-muted">${esc(l.ip_address||'—')}</td></tr>`).join('')
        : `<tr><td colspan="6">${empty('No log entries match.','shield')}</td></tr>`;
    } catch (err) { document.getElementById('auditBody').innerHTML = `<tr><td colspan="6">${empty(err.message,'exclamation-triangle')}</td></tr>`; }
  }
  async function exportAudit(e) {
    e.preventDefault();
    try {
      const res = await fetch(API.url('/analytics/audit-logs/export'), { headers: { Authorization: `Bearer ${API.getToken()}` } });
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_logs.csv'; a.click();
      UI.toast('Audit log exported','success');
    } catch (err) { UI.toast(err.message,'danger'); }
  }

  // ---------- Admin users ----------
  async function users() {
    const u = UI.requireRole('admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-people text-primary"></i> User Management','/admin/users',
      `<div class="card p-3">${UI.skeleton(300)}</div>`);
    loadAdminBadges();
    try {
      const list = await API.get('/admin/users');
      const rows = list.map(x => `<tr><td>${x.id}</td><td>${esc(x.name)}</td><td>${esc(x.email)}</td>
        <td><span class="badge bg-light text-primary border text-capitalize">${esc(x.role)}</span></td>
        <td>${statusBadge(x.status)}</td><td>${fmtDate(x.created_at)}</td>
        <td><select class="form-select form-select-sm" style="width:130px" onchange="Dash.setStatus(${x.id}, this.value)">
          ${['active','suspended','banned'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-people text-primary"></i> User Management</h3>
        <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Set Status</th></tr></thead>
          <tbody>${rows}</tbody></table></div></div>`;
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function setStatus(id, status) {
    try { await API.put(`/admin/users/${id}/status?new_status=${status}`); UI.toast('User status updated','success'); }
    catch (e) { UI.toast(e.message,'danger'); }
  }

  return { organizer, delEvent, delAd, remindAdExpiry, readNotif, filterAds, advertiser, newCampaign, submitAd, updateAdFee, fisherman, submitCatch, markSold, delCatch,
    _adPrices: {},
    admin, approve, reject, approveAd, rejectAd, pendingEvents, pendingAds, loadAdminBadges,
    audit, loadAudit, exportAudit, users, setStatus };
})();
