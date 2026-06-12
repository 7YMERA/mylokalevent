/* Public-facing views: home, events, event detail, spots, catches, news. */
const Public = (() => {
  const { app, spinner, empty, esc, money, fmtDate, fmtDateTime, statusBadge, eventCard, STATES } = UI;

  // ---------- Screen 1: Homepage ----------
  async function home() {
    app().innerHTML = `
      <section class="hero">
        <div class="container text-center">
          <h1 class="display-5">Discover Local Events &amp; Fresh Catches</h1>
          <p class="lead mb-4">Fishing competitions, coastal markets &amp; community gatherings across Malaysia.</p>
          <form class="row g-2 justify-content-center" onsubmit="Public.heroSearch(event)">
            <div class="col-md-3"><select id="hState" class="form-select"><option value="">All States</option>
              ${STATES.map(s => `<option>${s}</option>`).join('')}</select></div>
            <div class="col-md-4"><input id="hKeyword" class="form-control" placeholder="Search events…"></div>
            <div class="col-md-2"><button class="btn btn-light text-primary fw-bold w-100"><i class="bi bi-search"></i> Search</button></div>
          </form>
        </div>
      </section>
      <div class="container mt-4">
        <div class="row">
          <div class="col-lg-8">
            <h4 class="mb-3"><i class="bi bi-stars text-primary"></i> Featured Events</h4>
            <div class="row" id="featured">${spinner()}</div>
          </div>
          <aside class="col-lg-4">
            <h5 class="mb-3"><i class="bi bi-megaphone text-primary"></i> Sponsored</h5>
            <div id="adPanel">${spinner()}</div>
          </aside>
        </div>
      </div>`;
    try {
      const data = await API.get('/events?sort=newest&page_size=6');
      document.getElementById('featured').innerHTML = data.items.length
        ? data.items.map(eventCard).join('') : empty('No events yet. Check back soon!', 'calendar-x');
    } catch (e) { document.getElementById('featured').innerHTML = empty(e.message, 'exclamation-triangle'); }
    try {
      const ads = await API.get('/advertisements?page_size=4');
      const box = document.getElementById('adPanel');
      box.innerHTML = ads.items.length ? ads.items.map(a => `
        <a href="/api/advertisements/${a.id}/click" target="_blank" class="d-block mb-3"
           onclick="fetch('/api/advertisements/${a.id}/impression',{method:'POST'})">
          ${a.image_url ? `<img src="${esc(a.image_url)}" class="img-fluid rounded shadow-sm">`
            : `<div class="card card-body text-center text-primary">${esc(a.title)}</div>`}
        </a>`).join('') : `<div class="card card-body text-muted small text-center">Your ad here</div>`;
    } catch { document.getElementById('adPanel').innerHTML = ''; }
  }

  function heroSearch(e) {
    e.preventDefault();
    const s = document.getElementById('hState').value, k = document.getElementById('hKeyword').value;
    location.hash = `#/events?state=${encodeURIComponent(s)}&q=${encodeURIComponent(k)}`;
  }

  // ---------- Screen 2: Events list + filter ----------
  async function events(params) {
    const f = Object.assign({ q: '', state: '', district: '', category_id: '', fee: '', sort: 'newest', page: 1 }, params);
    app().innerHTML = `<div class="container py-4"><div class="row">
      <aside class="col-lg-3 mb-4">
        <div class="card card-body">
          <h6 class="fw-bold mb-3"><i class="bi bi-funnel"></i> Filters</h6>
          <div class="mb-2"><label class="form-label small">Keyword</label>
            <input id="fq" class="form-control form-control-sm" value="${esc(f.q)}"></div>
          <div class="mb-2"><label class="form-label small">State</label>
            <select id="fstate" class="form-select form-select-sm"><option value="">All</option>
              ${STATES.map(s => `<option ${s === f.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="mb-2"><label class="form-label small">District</label>
            <input id="fdistrict" class="form-control form-control-sm" value="${esc(f.district)}"></div>
          <div class="mb-2"><label class="form-label small">Category</label>
            <select id="fcat" class="form-select form-select-sm"><option value="">All</option></select></div>
          <div class="mb-3"><label class="form-label small">Fee</label>
            <select id="ffee" class="form-select form-select-sm">
              <option value="">Any</option><option value="free" ${f.fee==='free'?'selected':''}>Free</option>
              <option value="paid" ${f.fee==='paid'?'selected':''}>Paid</option></select></div>
          <button class="btn btn-primary btn-sm w-100" onclick="Public.applyFilters()">Apply</button>
        </div>
      </aside>
      <div class="col-lg-9">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mb-0">Events</h4>
          <select id="fsort" class="form-select form-select-sm w-auto" onchange="Public.applyFilters()">
            <option value="newest" ${f.sort==='newest'?'selected':''}>Newest</option>
            <option value="popular" ${f.sort==='popular'?'selected':''}>Most Popular</option>
            <option value="upcoming" ${f.sort==='upcoming'?'selected':''}>Upcoming</option>
          </select>
        </div>
        <div class="row" id="evResults">${spinner()}</div>
        <nav id="evPager" class="mt-3"></nav>
      </div></div></div>`;

    // categories
    try {
      const cats = await API.get('/categories?kind=event');
      document.getElementById('fcat').innerHTML = '<option value="">All</option>' +
        cats.map(c => `<option value="${c.id}" ${String(c.id) === String(f.category_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    } catch {}

    try {
      const data = await API.get('/events' + API.qs(f));
      document.getElementById('evResults').innerHTML = data.items.length
        ? data.items.map(eventCard).join('') : empty('No events match your filters.', 'search');
      // pager
      if (data.pages > 1) {
        let h = '<ul class="pagination justify-content-center">';
        for (let p = 1; p <= data.pages; p++)
          h += `<li class="page-item ${p === data.page ? 'active' : ''}"><a class="page-link" href="#" onclick="Public.gotoPage(${p});return false">${p}</a></li>`;
        document.getElementById('evPager').innerHTML = h + '</ul>';
      }
    } catch (e) { document.getElementById('evResults').innerHTML = empty(e.message, 'exclamation-triangle'); }
    Public._f = f;
  }
  function applyFilters() {
    const f = {
      q: document.getElementById('fq').value, state: document.getElementById('fstate').value,
      district: document.getElementById('fdistrict').value, category_id: document.getElementById('fcat').value,
      fee: document.getElementById('ffee').value, sort: document.getElementById('fsort').value, page: 1,
    };
    location.hash = '#/events' + API.qs(f);
  }
  function gotoPage(p) { const f = Object.assign({}, Public._f, { page: p }); location.hash = '#/events' + API.qs(f); }

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

  return { home, heroSearch, events, applyFilters, gotoPage, eventDetail, saveEvent, catches, spots, news, _f: {} };
})();
