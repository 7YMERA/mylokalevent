/* API client + auth/session handling. */
const API = (() => {
  const TOKEN_KEY = 'mle_token';
  const USER_KEY = 'mle_user';

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
  const isAuthed = () => !!getToken();

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(method, path, body, isForm = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let payload;
    if (body !== undefined && body !== null) {
      if (isForm) { payload = body; }
      else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    }
    const res = await fetch(`/api${path}`, { method, headers, body: payload });
    if (res.status === 401) {
      clearSession();
      if (!location.hash.startsWith('#/login')) location.hash = '#/login';
    }
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.detail) ? (Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail) : `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  const get = (p) => request('GET', p);
  const post = (p, b) => request('POST', p, b);
  const put = (p, b) => request('PUT', p, b);
  const del = (p) => request('DELETE', p);

  // --- auth ---
  async function login(email, password) {
    const data = await post('/auth/login', { email, password });
    setSession(data.access_token, data.user);
    return data.user;
  }
  async function register(payload) {
    const data = await post('/auth/register', payload);
    setSession(data.access_token, data.user);
    return data.user;
  }
  async function logout() {
    try { await post('/auth/logout'); } catch {}
    clearSession();
  }

  // query string helper
  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.append(k, v); });
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return { get, post, put, del, login, register, logout, getUser, getToken, isAuthed, clearSession, qs };
})();
