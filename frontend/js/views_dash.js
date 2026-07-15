/* Role dashboards: organizer, advertiser, fisherman, admin, audit, users. */
const Dash = (() => {
  const { app, spinner, empty, esc, money, fmtDate, fmtDateTime, statusBadge } = UI;
  let charts = [];
  function clearCharts() { charts.forEach(c => c.destroy()); charts = []; }

  function kpi(val, label, cls, icon) {
    return `<div class="col-6 col-lg-3 mb-3"><div class="kpi p-3 ${cls} h-100">
      <div class="d-flex justify-content-between"><div><div class="kpi-val">${val}</div><div class="small">${label}</div></div>
      <i class="bi bi-${icon}" style="font-size:1.8rem;opacity:.5"></i></div></div></div>`;
  }
  const shell = (title, sidebarActive, body) => {
    const u = API.getUser();
    const links = {
      organizer: [['#/organizer','Dashboard','speedometer2'],['#/create-event','Post Event','plus-circle']],
      advertiser: [['#/advertiser','Dashboard','speedometer2'],['#/advertiser/new','New Campaign','plus-circle']],
      fisherman: [['#/fisherman','Dashboard','speedometer2']],
      admin: [['#/admin','Dashboard','speedometer2'],['#/admin/audit','Audit Logs','shield-check'],['#/admin/users','Users','people']],
    }[u.role] || [];
    return `<div class="container-fluid py-4"><div class="row">
      <aside class="col-lg-2 mb-3 dash-sidebar">
        <div class="list-group">${links.map(([h,t,i]) =>
          `<a href="${h}" class="list-group-item list-group-item-action border-0 nav-link ${h===sidebarActive?'active':''}"><i class="bi bi-${i}"></i> ${t}</a>`).join('')}</div>
      </aside>
      <div class="col-lg-10"><h3 class="mb-3">${title}</h3>${body}</div></div></div>`;
  };

  // ---------- Screen 7: Organizer ----------
  async function organizer() {
    const u = UI.requireRole('organizer', 'admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-speedometer2 text-primary"></i> Organizer Dashboard', '#/organizer',
      UI.skeletonKpis(4) + `<div class="card p-3 mt-2">${UI.skeleton(240)}</div>`);
    try {
      const d = await API.get('/me/organizer-summary');
      const rows = d.events.map(e => `<tr>
        <td><a href="#/events/${e.id}">${esc(e.title)}</a></td>
        <td>${esc(e.district)}, ${esc(e.state)}</td>
        <td>${fmtDate(e.start_date)}</td><td>${statusBadge(e.status)}</td>
        <td class="text-center">${e.view_count||0}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="Dash.delEvent(${e.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-speedometer2 text-primary"></i> Organizer Dashboard</h3>
        <div class="row">
          ${kpi(d.total_events,'My Events','kpi-blue','calendar-event')}
          ${kpi(d.live,'Live','kpi-green','broadcast')}
          ${kpi(d.pending,'Pending','kpi-orange','hourglass-split')}
          ${kpi(d.total_views,'Total Views','kpi-purple','eye')}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3 mb-2">
          <h5 class="mb-0">My Events</h5><a href="#/create-event" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> Post Event</a></div>
        <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Title</th><th>Location</th><th>Date</th><th>Status</th><th class="text-center">Views</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6">${empty('You have not posted any events yet.','calendar-x')}</td></tr>`}</tbody>
        </table></div></div>`;
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function delEvent(id) {
    if (!confirm('Delete this event?')) return;
    try { await API.del(`/events/${id}`); UI.toast('Event deleted','success'); organizer(); }
    catch (e) { UI.toast(e.message,'danger'); }
  }

  // ---------- Screen 10: Advertiser ----------
  async function advertiser() {
    const u = UI.requireRole('advertiser', 'admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-megaphone text-primary"></i> Advertiser Dashboard', '#/advertiser',
      UI.skeletonKpis(4) + `<div class="card p-3 mt-2">${UI.skeleton(240)}</div>`);
    try {
      const d = await API.get('/me/advertiser-summary');
      const rows = d.campaigns.map(a => `<tr>
        <td>${a.image_url?`<img src="${esc(a.image_url)}" width="60" class="rounded">`:'<span class="text-muted">—</span>'}</td>
        <td>${esc(a.title)}</td><td>${statusBadge(a.status)}</td>
        <td class="text-center">${a.impressions||0}</td><td class="text-center">${a.clicks||0}</td>
        <td class="text-center"><b>${a.ctr||0}%</b></td><td>${fmtDate(a.end_date)}</td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-megaphone text-primary"></i> Advertiser Dashboard</h3>
        <div class="row">
          ${kpi(d.total_campaigns,'Campaigns','kpi-blue','collection')}
          ${kpi(d.active,'Active','kpi-green','broadcast')}
          ${kpi(d.total_impressions,'Impressions','kpi-purple','eye')}
          ${kpi(d.total_clicks,'Clicks','kpi-orange','hand-index')}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-3 mb-2">
          <h5 class="mb-0">My Campaigns</h5><a href="#/advertiser/new" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle"></i> New Campaign</a></div>
        <div class="row"><div class="col-lg-7"><div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
          <thead class="table-light"><tr><th>Banner</th><th>Title</th><th>Status</th><th class="text-center">Impr.</th><th class="text-center">Clicks</th><th class="text-center">CTR</th><th>Ends</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">${empty('No campaigns yet.','megaphone')}</td></tr>`}</tbody></table></div></div></div>
          <div class="col-lg-5"><div class="card card-body"><h6>Clicks by Campaign</h6><canvas id="adChart" height="200"></canvas></div></div></div>`;
      clearCharts();
      if (d.campaigns.length) {
        charts.push(new Chart(document.getElementById('adChart'), { type: 'bar',
          data: { labels: d.campaigns.map(c => c.title.slice(0,12)), datasets: [{ label:'Clicks', data: d.campaigns.map(c=>c.clicks||0), backgroundColor:'#1B6CA8' }] },
          options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } }));
      }
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }

  async function newCampaign() {
    const u = UI.requireRole('advertiser','admin'); if (!u) return;
    app().innerHTML = shell('New Campaign','#/advertiser/new', `<div class="col-lg-8">
      <form onsubmit="Dash.submitAd(event)">
        <!-- Section 1: Campaign details -->
        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-card-text text-primary"></i> Campaign Details</h6>
          <div class="mb-3"><label class="form-label required">Title / Headline</label>
            <input id="adTitle" class="form-control" maxlength="200" required placeholder="e.g. 20% off all fishing rods this week"></div>
          <div class="mb-3"><label class="form-label">Description</label>
            <textarea id="adDesc" class="form-control" rows="3" maxlength="500"
              placeholder="Describe your offer, product, or service…"></textarea></div>
          <div class="mb-1"><label class="form-label">Target URL (where the banner links to)</label>
            <input id="adUrl" class="form-control" placeholder="https://yourshop.com"></div>
        </div>

        <!-- Section 2: Banner artwork -->
        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-image text-primary"></i> Banner Artwork</h6>
          <p class="small text-muted">Recommended 1200×300px. Upload from your device.</p>
          ${UI.uploader('adImg', 'ads', { size: 90, label: 'Upload banner' })}
        </div>

        <!-- Section 3: Schedule & contact -->
        <div class="card card-body mb-3">
          <h6 class="fw-bold mb-3"><i class="bi bi-calendar-week text-primary"></i> Schedule &amp; Contact</h6>
          <div class="row">
            <div class="col-md-4 mb-3"><label class="form-label">Start Date</label>
              <input id="adStart" type="date" class="form-control"></div>
            <div class="col-md-4 mb-3"><label class="form-label">Contact Email</label>
              <input id="adEmail" type="email" class="form-control" placeholder="you@shop.com"></div>
            <div class="col-md-4 mb-3"><label class="form-label">Contact Phone</label>
              <input id="adPhone" class="form-control" placeholder="01x-xxxxxxx"></div>
          </div>
          <div class="alert alert-info mb-0"><i class="bi bi-info-circle"></i> RM70 for a 7-day run. Admin approval required before it goes live. (Demo mode auto-pays.)</div>
        </div>

        <button class="btn btn-success" id="adBtn"><i class="bi bi-credit-card"></i> Create &amp; Pay RM70</button>
      </form></div>`);
  }
  async function submitAd(e) {
    e.preventDefault();
    const btn = document.getElementById('adBtn'); btn.disabled = true; btn.textContent='Processing…';
    try {
      const res = await API.post('/advertisements', {
        title: document.getElementById('adTitle').value,
        description: document.getElementById('adDesc').value || null,
        image_url: document.getElementById('adImg').value || null,
        target_url: document.getElementById('adUrl').value || null,
        start_date: document.getElementById('adStart').value || null,
        contact_email: document.getElementById('adEmail').value || null,
        contact_phone: document.getElementById('adPhone').value || null });
      if (res.payment && res.payment.payment_url) { window.location.href = res.payment.payment_url; return; }
      UI.toast('Campaign created & paid! Awaiting admin approval.','success'); location.hash = '#/advertiser';
    } catch (err) { UI.toast(err.message,'danger'); btn.disabled=false; btn.innerHTML='<i class="bi bi-credit-card"></i> Create & Pay RM70'; }
  }

  // ---------- Fisherman ----------
  async function fisherman() {
    const u = UI.requireRole('fisherman','admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-fish text-primary"></i> Fishermen Co-op Dashboard','#/fisherman',
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
    app().innerHTML = shell('<i class="bi bi-speedometer2 text-primary"></i> Admin Dashboard', '#/admin',
      UI.skeletonKpis(4) + `<div class="row">
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
        <div class="col-lg-4 mb-3"><div class="card p-3">${UI.skeleton(220)}</div></div>
      </div>${UI.skeleton(180, '100%')}`);
    try {
      const [d, byState, byCat, revenue, pending, pendingAds] = await Promise.all([
        API.get('/analytics/dashboard'), API.get('/analytics/events-by-state'),
        API.get('/analytics/events-by-category'), API.get('/analytics/revenue-monthly'),
        API.get('/admin/events/pending'), API.get('/admin/advertisements/pending') ]);
      const pendRows = pending.map(e => `<tr><td><a href="#/events/${e.id}">${esc(e.title)}</a></td>
        <td>${esc(e.district)}, ${esc(e.state)}</td><td>${fmtDate(e.start_date)}</td>
        <td class="text-nowrap"><button class="btn btn-sm btn-success" onclick="Dash.approve(${e.id})"><i class="bi bi-check-lg"></i> Approve</button>
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.reject(${e.id})">Reject</button></td></tr>`).join('');
      const adRows = pendingAds.map(a => `<tr>
        <td>${a.image_url ? `<img src="${esc(a.image_url)}" width="70" class="rounded">` : '<span class="text-muted">—</span>'}</td>
        <td>${esc(a.title)}<div class="small text-muted">${esc((a.description || '').slice(0, 60))}</div></td>
        <td class="text-nowrap"><button class="btn btn-sm btn-success" onclick="Dash.approveAd(${a.id})"><i class="bi bi-check-lg"></i> Approve</button>
            <button class="btn btn-sm btn-outline-danger" onclick="Dash.rejectAd(${a.id})">Reject</button></td></tr>`).join('');
      app().querySelector('.col-lg-10').innerHTML = `<h3 class="mb-3"><i class="bi bi-speedometer2 text-primary"></i> Admin Dashboard</h3>
        <div class="row">
          ${kpi(d.total_events,'Total Events','kpi-blue','calendar-event')}
          ${kpi(d.pending_approvals,'Pending Events','kpi-orange','hourglass-split')}
          ${kpi(money(d.total_revenue),'Revenue','kpi-green','cash-stack')}
          ${kpi(d.active_ads,'Active Ads','kpi-purple','megaphone')}
        </div>
        <div class="row">
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Events by State</h6><canvas id="cState" height="220"></canvas></div></div>
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Monthly Revenue</h6><canvas id="cRev" height="220"></canvas></div></div>
          <div class="col-lg-4 mb-3"><div class="card card-body"><h6>Events by Category</h6><canvas id="cCat" height="220"></canvas></div></div>
        </div>
        <div class="row">
          <div class="col-lg-7 mb-3">
            <h5 class="mb-2"><i class="bi bi-calendar-check"></i> Pending Events <span class="badge bg-warning">${pending.length}</span></h5>
            <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
              <thead class="table-light"><tr><th>Title</th><th>Location</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>${pendRows || `<tr><td colspan="4">${empty('No events awaiting approval. 🎉','check2-circle')}</td></tr>`}</tbody></table></div></div>
          </div>
          <div class="col-lg-5 mb-3">
            <h5 class="mb-2"><i class="bi bi-megaphone"></i> Pending Ads <span class="badge bg-warning">${pendingAds.length}</span></h5>
            <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
              <thead class="table-light"><tr><th>Banner</th><th>Campaign</th><th>Action</th></tr></thead>
              <tbody>${adRows || `<tr><td colspan="3">${empty('No ads awaiting approval.','megaphone')}</td></tr>`}</tbody></table></div></div>
          </div>
        </div>`;
      clearCharts();
      charts.push(new Chart(document.getElementById('cState'), { type:'bar',
        data:{ labels: byState.map(x=>x.label), datasets:[{data:byState.map(x=>x.value), backgroundColor:'#1B6CA8'}]},
        options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}));
      charts.push(new Chart(document.getElementById('cRev'), { type:'line',
        data:{ labels: revenue.map(x=>x.label), datasets:[{data:revenue.map(x=>x.value), borderColor:'#28A745', backgroundColor:'rgba(40,167,69,.1)', fill:true, tension:.3}]},
        options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}));
      charts.push(new Chart(document.getElementById('cCat'), { type:'doughnut',
        data:{ labels: byCat.map(x=>x.label), datasets:[{data:byCat.map(x=>x.value), backgroundColor:['#1B6CA8','#2E75B6','#28A745','#FD7E14','#845ef7','#DC3545']}]}}));
    } catch (e) { app().querySelector('.col-lg-10').innerHTML = empty(e.message,'exclamation-triangle'); }
  }
  async function approve(id){ try{ await API.post(`/admin/events/${id}/approve`); UI.toast('Event approved & published','success'); admin(); }catch(e){UI.toast(e.message,'danger');} }
  async function reject(id){ const r = prompt('Reason for rejection:'); if(!r)return; try{ await API.post(`/admin/events/${id}/reject`,{reason:r}); UI.toast('Event rejected','warning'); admin(); }catch(e){UI.toast(e.message,'danger');} }
  async function approveAd(id){ try{ await API.post(`/admin/advertisements/${id}/approve`); UI.toast('Ad approved & now running','success'); admin(); }catch(e){UI.toast(e.message,'danger');} }
  async function rejectAd(id){ const r = prompt('Reason for rejection:'); if(!r)return; try{ await API.post(`/admin/advertisements/${id}/reject`,{reason:r}); UI.toast('Ad rejected','warning'); admin(); }catch(e){UI.toast(e.message,'danger');} }

  // ---------- Screen 6: Audit log viewer ----------
  async function audit() {
    const u = UI.requireRole('admin'); if (!u) return;
    app().innerHTML = shell('<i class="bi bi-shield-check text-primary"></i> Audit Logs','#/admin/audit', `
      <div class="card card-body mb-3"><form class="row g-2 align-items-end" onsubmit="Dash.loadAudit(event)">
        <div class="col-auto"><label class="form-label small">Action</label>
          <select id="aAction" class="form-select form-select-sm"><option value="">All</option>
            ${['CREATE','UPDATE','DELETE','APPROVE','REJECT','LOGIN','LOGOUT','LOGIN_FAILED','EXPORT'].map(a=>`<option>${a}</option>`).join('')}</select></div>
        <div class="col-auto"><label class="form-label small">User ID</label><input id="aUser" type="number" class="form-control form-control-sm" style="width:100px"></div>
        <div class="col-auto"><button class="btn btn-primary btn-sm">Filter</button></div>
        <div class="col-auto"><a href="/api/analytics/audit-logs/export" class="btn btn-outline-success btn-sm" id="aExport"><i class="bi bi-download"></i> Export CSV</a></div>
      </form></div>
      <div class="card"><div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">
        <thead class="table-light"><tr><th>Time</th><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>IP</th></tr></thead>
        <tbody id="auditBody">${spinner()}</tbody></table></div></div>`);
    // Export needs auth header — fetch as blob
    document.getElementById('aExport').onclick = Dash.exportAudit;
    loadAudit();
  }
  async function loadAudit(e) {
    if (e) e.preventDefault();
    const action = document.getElementById('aAction')?.value || '';
    const user_id = document.getElementById('aUser')?.value || '';
    try {
      const data = await API.get('/analytics/audit-logs' + API.qs({ action, user_id, page_size: 100 }));
      document.getElementById('auditBody').innerHTML = data.items.length ? data.items.map(l => `<tr>
        <td class="small">${fmtDateTime(l.created_at)}</td><td>${l.user_id ?? '—'}</td>
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
    app().innerHTML = shell('<i class="bi bi-people text-primary"></i> User Management','#/admin/users',
      `<div class="card p-3">${UI.skeleton(300)}</div>`);
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

  return { organizer, delEvent, advertiser, newCampaign, submitAd, fisherman, submitCatch, markSold, delCatch,
    admin, approve, reject, approveAd, rejectAd, audit, loadAudit, exportAudit, users, setStatus };
})();
