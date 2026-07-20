/* Auth views: login, register, event submission wizard, saved events. */
const Auth = (() => {
  const { app, spinner, empty, esc, money, fmtDate, fmtDateTime, eventCard, STATES } = UI;

  // ---------- Login ----------
  function login() {
    app().innerHTML = `<div class="container py-5"><div class="row justify-content-center"><div class="col-md-5">
      <div class="card shadow-sm"><div class="card-body p-4">
        <h4 class="text-center mb-1">Welcome back</h4>
        <p class="text-center text-muted small">Log in to MyLokalEvent</p>
        <form onsubmit="Auth.submitLogin(event)">
          <div class="mb-3"><label class="form-label">Email</label>
            <input id="liEmail" type="email" class="form-control" required></div>
          <div class="mb-3"><label class="form-label">Password</label>
            <input id="liPass" type="password" class="form-control" required></div>
          <button class="btn btn-primary w-100" id="liBtn">Log In</button>
        </form>
        <div class="d-flex justify-content-between align-items-center mt-3 small">
          <span>No account? <a href="/register">Register</a></span>
          <div class="dropdown">
            <button class="btn btn-sm btn-link text-muted text-decoration-none dropdown-toggle p-0" type="button" data-bs-toggle="dropdown">
              <i class="bi bi-people"></i> Demo accounts
            </button>
            <ul class="dropdown-menu dropdown-menu-end small">
              <li><h6 class="dropdown-header">Click to log in</h6></li>
              <li><a class="dropdown-item" href="#" onclick="Auth.fillLogin('admin@mylokalevent.my','Admin@123');return false">
                <b>Admin</b><br><span class="text-muted">Platform Admin</span></a></li>
              <li><a class="dropdown-item" href="#" onclick="Auth.fillLogin('tac@demo.mylokalevent.my','Pass@123');return false">
                <b>Organizer 1</b><br><span class="text-muted">Terengganu Angling Club</span></a></li>
              <li><a class="dropdown-item" href="#" onclick="Auth.fillLogin('ppt@demo.mylokalevent.my','Pass@123');return false">
                <b>Organizer 2</b><br><span class="text-muted">Pancing Pro Tackle</span></a></li>
              <li><a class="dropdown-item" href="#" onclick="Auth.fillLogin('nck@demo.mylokalevent.my','Pass@123');return false">
                <b>Fishermen Co-op</b><br><span class="text-muted">Nelson Co-op Kuantan</span></a></li>
            </ul>
          </div>
        </div>
      </div></div></div></div></div>`;
  }
  // Fill the login form with a demo account and submit it (one-click demo login).
  function fillLogin(email, pass) {
    document.getElementById('liEmail').value = email;
    document.getElementById('liPass').value = pass;
    const form = document.querySelector('#app form');
    if (form) form.requestSubmit();
  }
  async function submitLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('liBtn'); btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const user = await API.login(document.getElementById('liEmail').value, document.getElementById('liPass').value);
      UI.renderNavbar(); UI.toast(`Welcome, ${user.name}!`, 'success');
      const dest = { organizer: '/organizer', advertiser: '/advertiser', fisherman: '/fisherman', admin: '/admin' }[user.role] || '/';
      navigate(dest);
    } catch (err) { UI.toast(err.message, 'danger'); btn.disabled = false; btn.textContent = 'Log In'; }
  }

  // ---------- Register ----------
  function register() {
    app().innerHTML = `<div class="container py-5"><div class="row justify-content-center"><div class="col-md-6">
      <div class="card shadow-sm"><div class="card-body p-4">
        <h4 class="text-center mb-3">Create your account</h4>
        <form onsubmit="Auth.submitRegister(event)">
          <div class="mb-3"><label class="form-label required">Full Name</label>
            <input id="rName" class="form-control" required></div>
          <div class="mb-3"><label class="form-label required">Email</label>
            <input id="rEmail" type="email" class="form-control" required></div>
          <div class="mb-3"><label class="form-label required">Password</label>
            <input id="rPass" type="password" class="form-control" minlength="6" required
              oninput="Auth.checkPasswordMatch()">
            <div class="form-text">At least 6 characters.</div></div>
          <div class="mb-3"><label class="form-label required">Confirm Password</label>
            <input id="rPass2" type="password" class="form-control" required oninput="Auth.checkPasswordMatch()">
            <div class="form-text" id="rPassMatch"></div></div>
          <div class="mb-3"><label class="form-label">Phone</label>
            ${UI.phoneField('rCode', 'rPhone')}</div>
          <div class="mb-3"><label class="form-label required">I am registering as</label>
            <select id="rRole" class="form-select">
              <option value="user">General User — browse &amp; save events</option>
              <option value="organizer">Event Organizer — post events (RM10) &amp; run ads (RM70/wk)</option>
              <option value="fisherman">Fishermen Co-op — list catches</option>
            </select></div>
          <button class="btn btn-primary w-100" id="rBtn">Create Account</button>
        </form>
        <p class="text-center small mt-3 mb-0">Already have an account? <a href="/login">Log in</a></p>
      </div></div></div></div></div>`;
  }
  // Live feedback on whether the two password fields match.
  function checkPasswordMatch() {
    const p = document.getElementById('rPass').value;
    const p2 = document.getElementById('rPass2').value;
    const el = document.getElementById('rPassMatch');
    if (!p2) { el.innerHTML = ''; return true; }
    if (p === p2) { el.innerHTML = '<span class="text-success">✓ Passwords match</span>'; return true; }
    el.innerHTML = '<span class="text-danger">Passwords do not match</span>';
    return false;
  }

  async function submitRegister(e) {
    e.preventDefault();
    if (document.getElementById('rPass').value !== document.getElementById('rPass2').value) {
      UI.toast('Passwords do not match', 'warning');
      return;
    }
    const btn = document.getElementById('rBtn'); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const user = await API.register({
        name: document.getElementById('rName').value, email: document.getElementById('rEmail').value,
        password: document.getElementById('rPass').value, phone: UI.fullPhone('rCode', 'rPhone'),
        role: document.getElementById('rRole').value,
      });
      UI.renderNavbar(); UI.toast('Account created!', 'success');
      const dest = { organizer: '/organizer', advertiser: '/advertiser', fisherman: '/fisherman' }[user.role] || '/';
      navigate(dest);
    } catch (err) { UI.toast(err.message, 'danger'); btn.disabled = false; btn.textContent = 'Create Account'; }
  }

  // ---------- Screen 4: Event submission wizard ----------
  async function createEvent() {
    const user = UI.requireRole('organizer', 'admin'); if (!user) return;
    let cats = [];
    try { cats = await API.get('/categories?kind=event'); } catch {}
    app().innerHTML = `<div class="container py-4"><div class="row justify-content-center"><div class="col-lg-8">
      <h3 class="mb-1"><i class="bi bi-plus-circle text-primary"></i> Post a New Event</h3>
      <p class="text-muted">A RM10 posting fee applies. Your event is reviewed by an admin before going live.</p>
      <div class="progress mb-4" style="height:6px"><div class="progress-bar" id="wizBar" style="width:25%;background:var(--primary)"></div></div>
      <form onsubmit="Auth.submitEvent(event)">
        <div class="wiz-step" data-step="1">
          <h5>Step 1 — Basic Info</h5>
          <div class="mb-3"><label class="form-label required">Event Title</label><input id="eTitle" class="form-control" required></div>
          <div class="mb-3"><label class="form-label">Description</label><textarea id="eDesc" class="form-control" rows="3"></textarea></div>
          <div class="mb-3"><label class="form-label">Category</label><select id="eCat" class="form-select">
            ${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="wiz-step d-none" data-step="2">
          <h5>Step 2 — Location</h5>
          <div class="mb-3"><label class="form-label required">State</label><select id="eState" class="form-select">
            ${STATES.map(s => `<option>${s}</option>`).join('')}</select></div>
          <div class="mb-3"><label class="form-label required">District</label><input id="eDistrict" class="form-control" required></div>
          <div class="mb-3"><label class="form-label">Google Maps link (optional)</label><input id="eMaps" class="form-control" placeholder="https://maps.google.com/..."></div>
        </div>
        <div class="wiz-step d-none" data-step="3">
          <h5>Step 3 — Schedule &amp; Fees</h5>
          <div class="row">
            <div class="col-md-6 mb-3"><label class="form-label required">Start</label><input id="eStart" type="datetime-local" class="form-control" required></div>
            <div class="col-md-6 mb-3"><label class="form-label required">End</label><input id="eEnd" type="datetime-local" class="form-control" required></div>
          </div>
          <div class="mb-3"><label class="form-label">Entry Fee (RM, 0 = free)</label><input id="eFee" type="number" min="0" step="0.01" value="0" class="form-control"></div>
        </div>
        <div class="wiz-step d-none" data-step="4">
          <h5>Step 4 — Banner &amp; Payment</h5>
          <div class="mb-3"><label class="form-label">Event banner (optional)</label>
            ${UI.uploader('eBanner', 'events', { size: 90, label: 'Upload banner' })}</div>
          <label class="form-label">Pay the RM10 posting fee with:</label>
          <div class="form-check"><input class="form-check-input" type="radio" name="epay" id="epayCredits" value="credits" ${(Number((API.getUser()||{}).credits||0) >= 10) ? 'checked' : 'disabled'}>
            <label class="form-check-label" for="epayCredits">Credits — RM10 <span class="text-muted">(balance: RM${Number((API.getUser()||{}).credits||0).toFixed(2)})</span></label></div>
          <div class="form-check mb-3"><input class="form-check-input" type="radio" name="epay" id="epayCard" value="card" ${(Number((API.getUser()||{}).credits||0) >= 10) ? '' : 'checked'}>
            <label class="form-check-label" for="epayCard">Card via Stripe</label></div>
          <div class="alert alert-info"><i class="bi bi-info-circle"></i> Your event is created and reviewed by an admin before going live.</div>
        </div>
        <div class="d-flex justify-content-between mt-3">
          <button type="button" class="btn btn-outline-secondary" id="wizPrev" onclick="Auth.wizNav(-1)" disabled>Back</button>
          <button type="button" class="btn btn-primary" id="wizNext" onclick="Auth.wizNav(1)">Next</button>
          <button type="submit" class="btn btn-success d-none" id="wizSubmit"><i class="bi bi-credit-card"></i> Submit &amp; Pay RM10</button>
        </div>
      </form></div></div></div>`;
    Auth._step = 1;
  }
  function wizNav(dir) {
    const total = 4;
    if (dir > 0) { // validate current step's required fields
      const cur = document.querySelector(`.wiz-step[data-step="${Auth._step}"]`);
      const req = [...cur.querySelectorAll('[required]')];
      for (const el of req) if (!el.value) { el.reportValidity(); return; }
    }
    Auth._step = Math.min(total, Math.max(1, Auth._step + dir));
    document.querySelectorAll('.wiz-step').forEach(s => s.classList.toggle('d-none', +s.dataset.step !== Auth._step));
    document.getElementById('wizBar').style.width = (Auth._step / total * 100) + '%';
    document.getElementById('wizPrev').disabled = Auth._step === 1;
    document.getElementById('wizNext').classList.toggle('d-none', Auth._step === total);
    document.getElementById('wizSubmit').classList.toggle('d-none', Auth._step !== total);
  }
  async function submitEvent(e) {
    e.preventDefault();
    const btn = document.getElementById('wizSubmit'); btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const payload = {
        title: document.getElementById('eTitle').value, description: document.getElementById('eDesc').value,
        category_id: +document.getElementById('eCat').value || null,
        state: document.getElementById('eState').value, district: document.getElementById('eDistrict').value,
        location_url: document.getElementById('eMaps').value || null,
        start_date: new Date(document.getElementById('eStart').value).toISOString(),
        end_date: new Date(document.getElementById('eEnd').value).toISOString(),
        entry_fee: +document.getElementById('eFee').value || 0,
        banner_url: document.getElementById('eBanner').value || null,
      };
      const payWith = document.querySelector('input[name="epay"]:checked')?.value || 'card';
      const res = await API.post('/events?pay_with=' + payWith, payload);
      if (res.payment && res.payment.payment_url) { window.location.href = res.payment.payment_url; return; }
      if (payWith === 'credits') { await API.syncUser(); UI.renderNavbar(); }
      UI.toast('Event submitted & fee paid! Awaiting admin approval.', 'success');
      navigate('/organizer');
    } catch (err) { UI.toast(err.message, 'danger'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-credit-card"></i> Submit & Pay RM10'; }
  }

  // ---------- Saved events ----------
  async function saved() {
    if (!API.isAuthed()) { navigate('/login'); return; }
    app().innerHTML = `<div class="container py-4"><h3 class="mb-3"><i class="bi bi-bookmark-heart text-primary"></i> Saved Events</h3>
      <div class="row" id="savedGrid">${spinner()}</div></div>`;
    try {
      const list = await API.get('/me/saved-events');
      document.getElementById('savedGrid').innerHTML = list.length ? list.map(eventCard).join('') : empty('No saved events yet.', 'bookmark');
    } catch (e) { document.getElementById('savedGrid').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  // ---------- Profile page (all roles) ----------
  async function profile() {
    if (!API.isAuthed()) { navigate('/login'); return; }
    app().innerHTML = `<div class="container py-4">${spinner()}</div>`;
    let me;
    try { me = await API.get('/me/profile'); }
    catch (e) { app().innerHTML = `<div class="container py-5">${empty(e.message, 'exclamation-triangle')}</div>`; return; }

    const avatar = me.profile_image
      ? `<img src="${esc(me.profile_image)}" class="rounded-circle avatar-lg" alt="">`
      : `<div class="rounded-circle avatar-lg avatar-initial">${esc((me.name || '?').charAt(0).toUpperCase())}</div>`;

    app().innerHTML = `<div class="container py-4">
      <div class="card mb-4"><div class="card-body">
        <div class="d-flex flex-column flex-md-row align-items-md-center gap-3">
          <div class="text-center">${avatar}</div>
          <div class="flex-grow-1">
            <h3 class="mb-1">${esc(me.name)} <span class="badge bg-light text-primary border text-capitalize">${esc(me.role)}</span></h3>
            <p class="text-muted mb-1"><i class="bi bi-envelope"></i> ${esc(me.email)}</p>
            <p class="text-muted mb-0"><i class="bi bi-calendar3"></i> Member since ${fmtDate(me.created_at)}</p>
          </div>
          <button class="btn btn-outline-primary" onclick="Auth.editProfile()"><i class="bi bi-pencil"></i> Edit Profile</button>
        </div>
        <div id="profileEdit" class="mt-3"></div>
      </div></div>

      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabPosts">My Posts</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabEvents">Saved / Joined Events</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="tabPosts"><div class="row" id="myPosts">${spinner()}</div></div>
        <div class="tab-pane fade" id="tabEvents"><div class="row" id="myEvents">${spinner()}</div></div>
      </div></div>`;

    Auth._me = me;
    loadMyPosts();
    loadMyEvents();
  }

  function editProfile() {
    const me = Auth._me;
    document.getElementById('profileEdit').innerHTML = `<div class="card card-body bg-light">
      <div class="row g-3 align-items-end">
        <div class="col-md-4"><label class="form-label small">Profile picture</label>
          ${UI.uploader('pfImage', 'avatars', { round: true, size: 72, value: me.profile_image || '', label: 'Upload photo' })}</div>
        <div class="col-md-4"><label class="form-label small">Name</label>
          <input id="pfName" class="form-control" value="${esc(me.name)}"></div>
        <div class="col-md-4"><label class="form-label small">Phone</label>
          ${UI.phoneField('pfCode', 'pfPhone', ...UI.splitPhone(me.phone))}</div>
      </div>
      <div class="mt-3 text-end">
        <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('profileEdit').innerHTML=''">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="Auth.saveProfile()"><i class="bi bi-check-lg"></i> Save</button>
      </div></div>`;
  }

  async function saveProfile() {
    try {
      await API.put('/me/profile', {
        name: document.getElementById('pfName').value || null,
        phone: UI.fullPhone('pfCode', 'pfPhone'),
        profile_image: document.getElementById('pfImage').value || null,
      });
      await API.syncUser();
      UI.renderNavbar();
      UI.toast('Profile updated', 'success');
      profile();
    } catch (e) { UI.toast(e.message, 'danger'); }
  }

  async function loadMyPosts() {
    const me = Auth._me;
    try {
      const posts = await API.get('/me/posts');
      document.getElementById('myPosts').innerHTML = posts.length ? posts.map(p => `
        <div class="col-md-6 col-lg-4 mb-4"><div class="card h-100">
          ${p.image_url ? `<img src="${esc(p.image_url)}" class="w-100" style="max-height:180px;object-fit:cover">` : ''}
          <div class="card-body">
            <p class="mb-2">${esc(p.caption)}</p>
            ${p.state ? `<span class="badge bg-light text-primary border me-1"><i class="bi bi-geo-alt"></i> ${esc(p.state)}</span>` : ''}
            <div class="mt-2 d-flex justify-content-between align-items-center">
              <small class="text-muted"><i class="bi bi-heart-fill text-danger"></i> ${p.likes || 0}</small>
              <small class="text-muted">${fmtDate(p.created_at)}</small>
            </div>
          </div></div></div>`).join('') : empty('You have not posted anything yet.', 'chat-square-heart');
    } catch (e) { document.getElementById('myPosts').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  async function loadMyEvents() {
    try {
      const list = await API.get('/me/saved-events');
      document.getElementById('myEvents').innerHTML = list.length
        ? list.map(eventCard).join('') : empty('No saved or joined events yet.', 'bookmark');
    } catch (e) { document.getElementById('myEvents').innerHTML = empty(e.message, 'exclamation-triangle'); }
  }

  // ---------- Credit Wallet ----------
  async function wallet() {
    if (!API.isAuthed()) { navigate('/login'); return; }
    app().innerHTML = `<div class="container py-4">${spinner()}</div>`;
    let w;
    try { w = await API.get('/me/wallet'); }
    catch (e) { app().innerHTML = `<div class="container py-5">${empty(e.message, 'exclamation-triangle')}</div>`; return; }

    // Keep the navbar's balance pill in sync with the authoritative wallet balance.
    const me = API.getUser();
    if (me && Number(me.credits) !== Number(w.balance)) {
      API.updateCachedUser({ credits: w.balance });
      UI.renderNavbar();
    }

    const txnRows = w.transactions.map(t => {
      const pos = Number(t.amount) >= 0;
      const typeLabel = { topup: 'Top-up', event: 'Event fee', advertisement: 'Ad fee', ad_renewal: 'Ad renewal' }[t.type] || t.type;
      return `<tr>
        <td class="small">${fmtDateTime(t.created_at)}</td>
        <td><span class="badge bg-light text-primary border">${esc(typeLabel)}</span></td>
        <td class="small">${esc(t.description || '')}</td>
        <td class="text-end fw-bold ${pos ? 'text-success' : 'text-danger'}">${pos ? '+' : ''}${money(t.amount)}</td>
        <td class="text-end small text-muted">${money(t.balance_after)}</td></tr>`;
    }).join('');

    app().innerHTML = `<div class="container py-4">
      <div class="row g-4">
        <div class="col-lg-4">
          <div class="card kpi kpi-blue p-4 mb-3">
            <div class="small">Credit Balance</div>
            <div class="kpi-val" style="font-size:2.6rem">${money(w.balance)}</div>
            <div class="small mt-1">1 credit = RM1 · spend on events &amp; ads</div>
          </div>
          <div class="card card-body">
            <h6 class="fw-bold mb-3"><i class="bi bi-plus-circle text-primary"></i> Top Up</h6>
            <div class="d-flex flex-wrap gap-2 mb-2">
              ${[20, 50, 100, 200].map(a => `<button class="btn btn-outline-primary btn-sm" onclick="Auth.topUp(${a})">RM${a}</button>`).join('')}
            </div>
            <div class="input-group input-group-sm">
              <span class="input-group-text">RM</span>
              <input id="topupCustom" type="number" min="1" class="form-control" placeholder="custom amount">
              <button class="btn btn-primary" onclick="Auth.topUp(+document.getElementById('topupCustom').value)">Add</button>
            </div>
            <div class="form-text">Paid securely via Stripe (test card 4242 4242 4242 4242).</div>
          </div>
          <button class="btn btn-sm btn-outline-secondary w-100 mt-2" onclick="Auth.remindLow()">
            <i class="bi bi-bell"></i> Notify me: low balance (demo)</button>
        </div>
        <div class="col-lg-8">
          <h5 class="mb-3"><i class="bi bi-clock-history text-primary"></i> Transaction History</h5>
          <div class="card"><div class="table-responsive"><table class="table table-hover mb-0 align-middle">
            <thead class="table-light"><tr><th>Date</th><th>Type</th><th>Details</th><th class="text-end">Amount</th><th class="text-end">Balance</th></tr></thead>
            <tbody>${txnRows || `<tr><td colspan="5">${empty('No transactions yet. Top up to get started!', 'wallet2')}</td></tr>`}</tbody>
          </table></div></div>
        </div>
      </div></div>`;
  }

  async function topUp(amount) {
    if (!amount || amount <= 0) { UI.toast('Enter a valid amount', 'warning'); return; }
    try {
      const res = await API.post('/me/wallet/topup', { amount });
      if (res.payment_url) { window.location.href = res.payment_url; return; }  // Stripe
      await API.syncUser(); UI.renderNavbar();
      UI.toast(`Added RM${amount} in credits`, 'success');
      wallet();
    } catch (e) { UI.toast(e.message, 'danger'); }
  }

  async function remindLow() {
    try { await API.post('/me/wallet/remind-low'); UI.toast('Low-balance alert added to notifications', 'success'); }
    catch (e) { UI.toast(e.message, 'danger'); }
  }

  return { login, fillLogin, submitLogin, register, submitRegister, checkPasswordMatch, createEvent, wizNav, submitEvent, saved,
    profile, editProfile, saveProfile, wallet, topUp, remindLow, _step: 1, _me: null };
})();
