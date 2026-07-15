/* Public-facing views: home, events, event detail, spots, catches, news. */
const Public = (() => {
  const { app, spinner, empty, esc, money, fmtDate, fmtDateTime, statusBadge, eventCard, STATES } = UI;

  // ---------- Screen 1: Homepage ----------
  async function home() {
    const user = API.getUser();
    app().innerHTML = `
      <section class="hero">
        <div class="container text-center">
          <h1 class="display-5">Discover Local Events &amp; Fresh Catches</h1>
          <p class="lead mb-4">Fishing competitions, coastal markets &amp; community gatherings across Malaysia.</p>
          <div class="d-flex gap-2 justify-content-center flex-wrap">
            <a href="#/events" class="btn btn-light btn-lg text-primary fw-bold"><i class="bi bi-search"></i> Search &amp; Filter Events</a>
            <a href="#/catches" class="btn btn-outline-light btn-lg"><i class="bi bi-fish"></i> Catch of the Day</a>
          </div>
        </div>
      </section>
      <div class="container mt-4">
        <!-- Featured events -->
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mb-0"><i class="bi bi-stars text-primary"></i> Featured Events</h4>
          <a href="#/events" class="btn btn-sm btn-outline-primary">View all &amp; filter <i class="bi bi-arrow-right"></i></a>
        </div>
        <div class="row" id="featured">${spinner()}</div>

        <!-- Sponsored strip -->
        <div id="adStrip" class="mb-2"></div>

        <!-- Community feed -->
        <div class="d-flex justify-content-between align-items-center mb-1 mt-4">
          <h4 class="mb-0"><i class="bi bi-people text-primary"></i> Community Feed</h4>
          ${user
            ? `<button class="btn btn-sm btn-primary" onclick="Public.toggleComposer()"><i class="bi bi-plus-circle"></i> Share a post</button>`
            : `<a href="#/login" class="btn btn-sm btn-outline-primary">Log in to share</a>`}
        </div>
        <p class="text-muted small mb-3">What anglers are sharing — catches, activities, and events they're joining.</p>
        <div id="composer" class="mb-3"></div>
        <div class="row" id="feed">${spinner()}</div>
      </div>`;
    loadFeatured();
    loadAdStrip();
    loadFeed();
  }

  async function loadFeatured() {
    try {
      const data = await API.get('/events?sort=popular&page_size=6');
      document.getElementById('featured').innerHTML = data.items.length
        ? data.items.map(eventCard).join('') : empty('No events yet. Check back soon!', 'calendar-x');
    } catch (e) { document.getElementById('featured').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  async function loadAdStrip() {
    try {
      const ads = await API.get('/advertisements?page_size=1');
      const box = document.getElementById('adStrip');
      if (!ads.items.length) { box.innerHTML = ''; return; }
      const a = ads.items[0];
      box.innerHTML = `<a href="${API.url('/advertisements/' + a.id + '/click')}" target="_blank"
          class="d-block position-relative text-decoration-none"
          onclick="fetch(API.url('/advertisements/${a.id}/impression'),{method:'POST'})">
        <span class="badge bg-dark position-absolute top-0 start-0 m-2 opacity-75">Sponsored</span>
        ${a.image_url ? `<img src="${esc(a.image_url)}" class="img-fluid rounded shadow-sm w-100" style="max-height:140px;object-fit:cover">`
          : `<div class="card card-body text-center text-primary">${esc(a.title)}</div>`}</a>`;
    } catch { document.getElementById('adStrip').innerHTML = ''; }
  }

  // ---------- Community feed ----------
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
    return fmtDate(iso);
  }

  function feedCard(p) {
    const initial = (p.author_name || '?').trim().charAt(0).toUpperCase();
    const locTag = p.state
      ? `<a href="#/events?state=${encodeURIComponent(p.state)}" class="badge bg-light text-primary border text-decoration-none me-1">
           <i class="bi bi-geo-alt"></i> ${esc(p.district ? p.district + ', ' : '')}${esc(p.state)}</a>` : '';
    const evTag = (p.event_id && p.event_title)
      ? `<a href="#/events/${p.event_id}" class="badge bg-primary text-decoration-none">
           <i class="bi bi-calendar-event"></i> ${esc(p.event_title)}</a>` : '';
    const user = API.getUser();
    const canDelete = user && (user.role === 'admin' || user.id === p.user_id);
    return `<div class="col-md-6 col-lg-4 mb-4"><div class="card card-hover h-100">
      <div class="card-body pb-2">
        <div class="d-flex align-items-center mb-2">
          <div class="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
               style="width:40px;height:40px;background:var(--secondary)">${initial}</div>
          <div class="ms-2">
            <div class="fw-bold" style="line-height:1">${esc(p.author_name)}</div>
            <small class="text-muted">${esc(p.author_role)} · ${timeAgo(p.created_at)}</small>
          </div>
          ${canDelete ? `<button class="btn btn-sm btn-link text-danger ms-auto p-0" title="Delete"
             onclick="Public.deletePost(${p.id})"><i class="bi bi-trash"></i></button>` : ''}
        </div>
        <p class="mb-2">${esc(p.caption)}</p>
      </div>
      ${p.image_url ? `<img src="${esc(p.image_url)}" class="w-100" style="max-height:220px;object-fit:cover">` : ''}
      <div class="card-body pt-2">
        <div class="mb-2">${locTag}${evTag}</div>
        <button class="btn btn-sm btn-outline-danger" onclick="Public.likePost(${p.id}, this)">
          <i class="bi bi-heart-fill"></i> <span>${p.likes || 0}</span></button>
      </div></div></div>`;
  }

  async function loadFeed() {
    try {
      const data = await API.get('/posts?page_size=12');
      document.getElementById('feed').innerHTML = data.items.length
        ? data.items.map(feedCard).join('')
        : empty('No posts yet. Be the first to share your catch!', 'chat-square-heart');
    } catch (e) { document.getElementById('feed').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  async function toggleComposer() {
    const box = document.getElementById('composer');
    if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
    // populate an event dropdown (optional "joining this event" tag)
    let events = [];
    try { events = (await API.get('/events?page_size=50')).items; } catch {}
    box.innerHTML = `<div class="card card-body">
      <textarea id="pcCaption" class="form-control mb-2" rows="2" maxlength="500"
        placeholder="Share your catch or activity…"></textarea>
      <div class="row g-2">
        <div class="col-md-4"><input id="pcImg" class="form-control form-control-sm" placeholder="Image URL (optional)"></div>
        <div class="col-md-3"><select id="pcState" class="form-select form-select-sm"><option value="">Tag a state…</option>
          ${STATES.map(s => `<option>${s}</option>`).join('')}</select></div>
        <div class="col-md-3"><input id="pcDistrict" class="form-control form-select-sm form-control-sm" placeholder="District (optional)"></div>
        <div class="col-md-2"><select id="pcEvent" class="form-select form-select-sm"><option value="">Event…</option>
          ${events.map(e => `<option value="${e.id}">${esc(e.title.slice(0, 30))}</option>`).join('')}</select></div>
      </div>
      <div class="mt-2 text-end">
        <button class="btn btn-sm btn-outline-secondary" onclick="Public.toggleComposer()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="Public.submitPost()"><i class="bi bi-send"></i> Post</button>
      </div></div>`;
  }

  async function submitPost() {
    const caption = document.getElementById('pcCaption').value.trim();
    if (!caption) { UI.toast('Write something first', 'warning'); return; }
    try {
      await API.post('/posts', {
        caption,
        image_url: document.getElementById('pcImg').value || null,
        state: document.getElementById('pcState').value || null,
        district: document.getElementById('pcDistrict').value || null,
        event_id: +document.getElementById('pcEvent').value || null,
      });
      UI.toast('Posted to the community feed!', 'success');
      document.getElementById('composer').innerHTML = '';
      loadFeed();
    } catch (e) { UI.toast(e.message, 'danger'); }
  }

  async function likePost(id, btn) {
    if (!API.isAuthed()) { UI.toast('Log in to like posts', 'warning'); return; }
    try {
      const r = await API.post(`/posts/${id}/like`);
      btn.querySelector('span').textContent = r.likes;
      btn.classList.replace('btn-outline-danger', 'btn-danger');
    } catch (e) { UI.toast(e.message, 'danger'); }
  }

  async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    try { await API.del(`/posts/${id}`); UI.toast('Post deleted', 'success'); loadFeed(); }
    catch (e) { UI.toast(e.message, 'danger'); }
  }

  // ---------- Screen 2: Events list + responsive filter ----------
  // Filters apply live in-place (no page reload) so typing/selecting updates
  // results instantly without losing input focus.
  let _searchTimer;

  async function events(params) {
    const f = Object.assign({ q: '', state: '', district: '', category_id: '', fee: '', sort: 'newest', page: 1 }, params);
    app().innerHTML = `<div class="container py-4"><div class="row">
      <aside class="col-lg-3 mb-4">
        <div class="card card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="fw-bold mb-0"><i class="bi bi-funnel"></i> Filters</h6>
            <button class="btn btn-sm btn-link text-decoration-none p-0" onclick="Public.clearFilters()">Clear</button>
          </div>
          <div class="mb-2"><label class="form-label small">Keyword</label>
            <input id="fq" class="form-control form-control-sm" value="${esc(f.q)}"
              placeholder="Search title…" oninput="Public.debouncedRefresh()"></div>
          <div class="mb-2"><label class="form-label small">State</label>
            <select id="fstate" class="form-select form-select-sm" onchange="Public.refreshResults(1)"><option value="">All</option>
              ${STATES.map(s => `<option ${s === f.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="mb-2"><label class="form-label small">District</label>
            <input id="fdistrict" class="form-control form-control-sm" value="${esc(f.district)}"
              placeholder="e.g. Kuantan" oninput="Public.debouncedRefresh()"></div>
          <div class="mb-2"><label class="form-label small">Category</label>
            <select id="fcat" class="form-select form-select-sm" onchange="Public.refreshResults(1)"><option value="">All</option></select></div>
          <div class="mb-3"><label class="form-label small">Fee</label>
            <select id="ffee" class="form-select form-select-sm" onchange="Public.refreshResults(1)">
              <option value="">Any</option><option value="free" ${f.fee==='free'?'selected':''}>Free</option>
              <option value="paid" ${f.fee==='paid'?'selected':''}>Paid</option></select></div>
        </div>
      </aside>
      <div class="col-lg-9">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div><h4 class="mb-0">Events</h4><small class="text-muted" id="evCount"></small></div>
          <select id="fsort" class="form-select form-select-sm w-auto" onchange="Public.refreshResults(1)">
            <option value="newest" ${f.sort==='newest'?'selected':''}>Newest</option>
            <option value="popular" ${f.sort==='popular'?'selected':''}>Most Popular</option>
            <option value="upcoming" ${f.sort==='upcoming'?'selected':''}>Upcoming</option>
          </select>
        </div>
        <div class="row" id="evResults">${spinner()}</div>
        <nav id="evPager" class="mt-3"></nav>
      </div></div></div>`;

    // categories (pre-select if the incoming params requested one)
    try {
      const cats = await API.get('/categories?kind=event');
      document.getElementById('fcat').innerHTML = '<option value="">All</option>' +
        cats.map(c => `<option value="${c.id}" ${String(c.id) === String(f.category_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    } catch {}

    refreshResults(f.page || 1);
  }

  function debouncedRefresh() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => refreshResults(1), 300);
  }

  function clearFilters() {
    ['fq', 'fdistrict'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['fstate', 'fcat', 'ffee'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const sort = document.getElementById('fsort'); if (sort) sort.value = 'newest';
    refreshResults(1);
  }

  async function refreshResults(page) {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const f = {
      q: val('fq'), state: val('fstate'), district: val('fdistrict'),
      category_id: val('fcat'), fee: val('ffee'), sort: val('fsort') || 'newest',
      page: page || 1,
    };
    Public._f = f;
    const grid = document.getElementById('evResults');
    if (!grid) return;
    grid.innerHTML = spinner();
    try {
      const data = await API.get('/events' + API.qs(f));
      grid.innerHTML = data.items.length
        ? data.items.map(eventCard).join('') : empty('No events match your filters.', 'search');
      const cnt = document.getElementById('evCount');
      if (cnt) cnt.textContent = data.total ? `${data.total} event${data.total > 1 ? 's' : ''} found` : '';
      const pager = document.getElementById('evPager');
      if (data.pages > 1) {
        let h = '<ul class="pagination justify-content-center">';
        for (let p = 1; p <= data.pages; p++)
          h += `<li class="page-item ${p === data.page ? 'active' : ''}"><a class="page-link" href="#" onclick="Public.refreshResults(${p});return false">${p}</a></li>`;
        pager.innerHTML = h + '</ul>';
      } else { pager.innerHTML = ''; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { grid.innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  // ---------- Screen 3: Event detail ----------
  async function eventDetail(id) {
    app().innerHTML = `<div class="container py-4">${spinner()}</div>`;
    try {
      const ev = await API.get(`/events/${id}`);
      const maps = ev.location_url
        ? `<a href="${esc(ev.location_url)}" target="_blank" class="btn btn-outline-primary"><i class="bi bi-geo-alt-fill"></i> Get Directions</a>`
        : '';
      app().innerHTML = `<div class="container py-4">
        <a href="#/events" class="text-muted small"><i class="bi bi-arrow-left"></i> Back to events</a>
        ${ev.banner_url ? `<img src="${esc(ev.banner_url)}" class="w-100 rounded my-3" style="max-height:320px;object-fit:cover">`
          : `<div class="bg-white rounded my-3 d-flex align-items-center justify-content-center text-primary" style="height:200px"><i class="bi bi-calendar-event" style="font-size:3rem"></i></div>`}
        <div class="row">
          <div class="col-lg-8">
            <div class="d-flex gap-2 align-items-center mb-2">${statusBadge(ev.status)}
              <span class="badge bg-light text-primary border"><i class="bi bi-geo-alt"></i> ${esc(ev.district)}, ${esc(ev.state)}</span></div>
            <h2>${esc(ev.title)}</h2>
            <p class="text-muted">${esc(ev.description || 'No description provided.')}</p>
            <div class="d-flex gap-2 mb-4">${maps}
              <button class="btn btn-outline-primary" onclick="Public.saveEvent(${ev.id})"><i class="bi bi-bookmark-heart"></i> Save</button></div>
            <div id="weatherBox"></div>
          </div>
          <aside class="col-lg-4">
            <div class="card card-body">
              <h6 class="fw-bold">Event Details</h6>
              <p class="mb-1"><i class="bi bi-calendar3 text-primary"></i> <b>Start:</b><br>${fmtDateTime(ev.start_date)}</p>
              <p class="mb-1"><i class="bi bi-calendar-check text-primary"></i> <b>End:</b><br>${fmtDateTime(ev.end_date)}</p>
              <p class="mb-1"><i class="bi bi-cash-coin text-primary"></i> <b>Entry Fee:</b> ${Number(ev.entry_fee) > 0 ? money(ev.entry_fee) : 'Free'}</p>
              <p class="mb-0"><i class="bi bi-eye text-primary"></i> ${ev.view_count || 0} views</p>
            </div>
          </aside>
        </div></div>`;
      // weather widget for fishing events
      try {
        const w = await API.get('/weather' + API.qs({ city: ev.district || ev.state }));
        document.getElementById('weatherBox').innerHTML = `
          <h6 class="fw-bold mt-3"><i class="bi bi-cloud-sun text-primary"></i> 5-Day Forecast — ${esc(w.location)}
            ${w.mock ? '<span class="badge bg-secondary">demo</span>' : ''}</h6>
          <div class="row text-center g-2">${w.forecast.map(d => `
            <div class="col"><div class="card card-body p-2">
              <small class="text-muted">${esc(d.date)}</small>
              <img src="https://openweathermap.org/img/wn/${d.icon}@2x.png" width="48" class="mx-auto">
              <b>${d.temp}°C</b><small>${esc(d.condition)}</small>
              <small class="text-muted"><i class="bi bi-wind"></i> ${d.wind} m/s</small>
            </div></div>`).join('')}</div>`;
      } catch {}
    } catch (e) { app().innerHTML = `<div class="container py-5">${empty(e.message, 'exclamation-triangle')}</div>`; }
  }

  async function saveEvent(id) {
    if (!API.isAuthed()) { UI.toast('Please log in to save events', 'warning'); location.hash = '#/login'; return; }
    try { await API.post(`/events/${id}/save`); UI.toast('Saved to your bookmarks', 'success'); }
    catch (e) { UI.toast(e.message, 'danger'); }
  }

  // ---------- Screen 8: Catch of the Day ----------
  async function catches() {
    app().innerHTML = `<div class="container py-4">
      <h3 class="mb-1"><i class="bi bi-fish text-primary"></i> Catch of the Day</h3>
      <p class="text-muted">Fresh seafood from local fishermen co-ops.</p>
      <div class="row" id="catchGrid">${spinner()}</div></div>`;
    try {
      const data = await API.get('/fish-catches?page_size=24');
      document.getElementById('catchGrid').innerHTML = data.items.length ? data.items.map(c => `
        <div class="col-md-3 mb-4"><div class="card card-hover h-100">
          ${c.image_url ? `<img src="${esc(c.image_url)}" class="event-thumb w-100">`
            : `<div class="event-thumb w-100 d-flex align-items-center justify-content-center text-primary"><i class="bi bi-fish" style="font-size:2.5rem"></i></div>`}
          <div class="card-body">
            <h6 class="mb-1">${esc(c.species)}</h6>
            <p class="mb-1 text-success fw-bold">${money(c.price_per_kg)}/kg</p>
            <p class="small text-muted mb-1"><i class="bi bi-box"></i> ${c.weight_kg} kg available</p>
            <p class="small text-muted mb-0"><i class="bi bi-geo-alt"></i> ${esc(c.location || '—')}</p>
          </div></div></div>`).join('') : empty('No catches listed right now.', 'fish');
    } catch (e) { document.getElementById('catchGrid').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  // ---------- Screen 9: Fishing Spots Directory ----------
  async function spots() {
    app().innerHTML = `<div class="container py-4">
      <h3 class="mb-1"><i class="bi bi-geo-alt text-primary"></i> Fishing Spots Directory</h3>
      <p class="text-muted">Recommended kolam pancing — tap to navigate via Google Maps.</p>
      <div class="row" id="spotGrid">${spinner()}</div></div>`;
    try {
      const list = await API.get('/spots');
      document.getElementById('spotGrid').innerHTML = list.length ? list.map(s => `
        <div class="col-md-4 mb-4"><div class="card card-hover h-100"><div class="card-body">
          <h5>${esc(s.name)}</h5>
          <span class="badge bg-light text-primary border mb-2"><i class="bi bi-geo-alt"></i> ${esc(s.district || '')}, ${esc(s.state || '')}</span>
          <p class="text-muted small">${esc(s.description || '')}</p>
          <a href="${esc(s.maps_url)}" target="_blank" class="btn btn-primary btn-sm w-100"><i class="bi bi-signpost-split"></i> Get Directions</a>
        </div></div></div>`).join('') : empty('No spots listed.', 'geo-alt');
    } catch (e) { document.getElementById('spotGrid').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  // ---------- News ----------
  async function news() {
    app().innerHTML = `<div class="container py-4"><h3 class="mb-3"><i class="bi bi-newspaper text-primary"></i> News &amp; Announcements</h3>
      <div id="newsList">${spinner()}</div></div>`;
    try {
      const data = await API.get('/news?page_size=20');
      document.getElementById('newsList').innerHTML = data.items.length ? data.items.map(n => `
        <div class="card mb-3"><div class="card-body">
          <h5>${esc(n.title)}</h5>
          <p class="text-muted small mb-2">${fmtDate(n.created_at)}</p>
          <p class="mb-0">${esc((n.body || '').slice(0, 240))}${(n.body || '').length > 240 ? '…' : ''}</p>
        </div></div>`).join('') : empty('No news yet.', 'newspaper');
    } catch (e) { document.getElementById('newsList').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  return { home, loadFeatured, loadAdStrip, loadFeed, toggleComposer, submitPost, likePost, deletePost,
    events, debouncedRefresh, clearFilters, refreshResults, eventDetail, saveEvent, catches, spots, news, _f: {} };
})();
