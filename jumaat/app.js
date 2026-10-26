// Jumaat Finder — finds mosques near you that hold Friday prayers and tells you
// when to leave. Runs entirely in the browser: prayer times from waktusolat.app
// (JAKIM data), mosques from OpenStreetMap (Overpass API), notes in localStorage.
(function () {
  "use strict";

  const TZ = "Asia/Kuala_Lumpur";
  const SEARCH_RADIUS_M = 3000;
  const WALK_M_PER_MIN = 80;   // relaxed walking pace
  const DETOUR = 1.3;          // straight line -> real street distance
  const FALLBACK_ZUHR = "13:15"; // rough KL Zuhr if the API is unreachable
  const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  const $ = (id) => document.getElementById(id);
  const state = {
    here: null,        // {lat, lng, label}
    friday: null,      // Date of the target Friday's Zuhr
    approxTime: false,
    places: [],
    markers: [],
    hereMarker: null,
  };

  // ---------- storage (never throw: private mode / blocked storage) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- time helpers (always in Malaysia time) ----------
  function klParts(date) {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(date);
    const o = {};
    p.forEach((x) => (o[x.type] = x.value));
    return o;
  }
  // Build a Date for a KL wall-clock time (KL is UTC+8, no DST).
  function klDate(y, m, d, hh, mm) {
    return new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
  }
  function fmtTime(date) {
    return new Intl.DateTimeFormat("en-MY", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  }
  function fmtDay(date) {
    return new Intl.DateTimeFormat("en-MY", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).format(date);
  }
  function addMin(date, min) { return new Date(date.getTime() + min * 60000); }

  // Date (KL calendar) of today if it's Friday and Jumaat hasn't ended, else next Friday.
  function targetFridayYMD(now) {
    const p = klParts(now);
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    let add = (5 - dow + 7) % 7;
    // After ~2:30pm on Friday, look at next week.
    if (add === 0 && (+p.hour * 60 + +p.minute) > 14 * 60 + 30) add = 7;
    const base = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + add));
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), isToday: add === 0 };
  }

  // ---------- prayer times ----------
  function parseDhuhr(v, ymd) {
    if (typeof v === "number") return new Date(v * 1000);
    if (typeof v === "string") {
      const [hh, mm] = v.split(":").map(Number);
      if (!isNaN(hh) && !isNaN(mm)) return klDate(ymd.y, ymd.m, ymd.d, hh, mm);
    }
    return null;
  }

  async function fetchJSON(url, opts = {}, timeoutMs = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error(r.status + " " + url);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function loadZuhr(lat, lng) {
    const ymd = targetFridayYMD(new Date());
    const urls = [
      `https://api.waktusolat.app/v2/solat/gps/${lat}/${lng}`,
      "https://api.waktusolat.app/v2/solat/WLY01",
    ];
    for (const url of urls) {
      try {
        const data = await fetchJSON(url);
        const prayers = data.prayers || [];
        const sameMonth = (data.month_number ? data.month_number === ymd.m : true);
        let row = sameMonth ? prayers.find((p) => p.day === ymd.d) : null;
        let approx = false;
        if (!row) {
          // Next Friday falls in another month: use today's Zuhr (moves only a few minutes).
          const today = +klParts(new Date()).day;
          row = prayers.find((p) => p.day === today) || prayers[0];
          approx = true;
        }
        const raw = row && parseDhuhr(row.dhuhr, approx ? { ...ymd } : ymd);
        if (raw) {
          // Re-anchor the clock time onto the target Friday.
          const p = klParts(raw);
          return { date: klDate(ymd.y, ymd.m, ymd.d, +p.hour, +p.minute), approx, zone: data.zone, isToday: ymd.isToday };
        }
      } catch (e) {
        console.warn("prayer time source failed", url, e);
      }
    }
    const [hh, mm] = FALLBACK_ZUHR.split(":").map(Number);
    return { date: klDate(ymd.y, ymd.m, ymd.d, hh, mm), approx: true, zone: null, isToday: ymd.isToday };
  }

  function renderHero(z) {
    state.friday = z.date;
    state.approxTime = z.approx;
    $("fridayLabel").textContent = z.isToday ? "Today · Friday" : fmtDay(z.date);
    $("zuhrTime").textContent = fmtTime(z.date);
    $("zuhrNote").textContent = "Zuhr / azan Jumaat" + (z.zone ? ` · zone ${z.zone}` : "") + (z.approx ? " · approx." : "");
    tick();
  }

  function tick() {
    if (!state.friday) return;
    const ms = state.friday - Date.now();
    let txt;
    if (ms <= 0) txt = "Now";
    else {
      const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
      txt = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mm}m` : `${mm} min`;
    }
    $("countdown").textContent = txt;
  }

  // ---------- mosques ----------
  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function classify(tags) {
    const n = (tags.name || tags["name:ms"] || tags["name:en"] || "").toLowerCase();
    if (/surau|musolla|musalla|musholla|prayer room|bilik solat/.test(n)) return "surau";
    if (/masjid|mosque|jami/.test(n) || tags.building === "mosque") return "masjid";
    return "surau"; // unnamed / unknown prayer spaces: don't assume Jumaat
  }

  async function loadMosques(here) {
    const q = `[out:json][timeout:25];nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${SEARCH_RADIUS_M},${here.lat},${here.lng});out center tags;`;
    let elements = null;
    for (const url of OVERPASS_URLS) {
      try {
        const data = await fetchJSON(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 30000);
        elements = data.elements || [];
        break;
      } catch (e) {
        console.warn("overpass failed", url, e);
      }
    }
    const live = (elements || []).map((e) => {
      const c = e.center || e;
      const t = e.tags || {};
      return {
        name: t.name || t["name:ms"] || t["name:en"] || "Unnamed prayer place",
        lat: c.lat, lng: c.lon,
        kind: classify(t),
        info: [t["addr:street"], t["addr:suburb"] || t["addr:city"]].filter(Boolean).join(", "),
      };
    }).filter((p) => p.lat && p.lng);

    // Merge hand-checked seed entries, skipping ones OSM already has nearby.
    const seeds = (window.JUMAAT_SEED || []).filter((s) => distanceM(here, s) <= SEARCH_RADIUS_M * 1.5);
    seeds.forEach((s) => {
      const dup = live.find((p) => distanceM(p, s) < 120);
      if (dup) { dup.kind = s.kind; dup.info = s.info || dup.info; }
      else live.push({ ...s });
    });
    return { places: live, offline: elements === null };
  }

  // ---------- planning ----------
  function plan(place) {
    const dist = distanceM(state.here, place);
    const walkMin = Math.max(1, Math.round((dist * DETOUR) / WALK_M_PER_MIN));
    const buffer = +$("bufferSelect").value;
    const leaveBy = addMin(state.friday, -(walkMin + buffer));
    const minsLeft = (leaveBy - Date.now()) / 60000;
    let chip;
    if (place.kind === "surau") chip = { cls: "surau", txt: "Surau · check Jumaat" };
    else if (minsLeft < 0) chip = { cls: "bad", txt: "Too late on foot" };
    else if (minsLeft < 15) chip = { cls: "warn", txt: "Leave now" };
    else chip = { cls: "ok", txt: "On track" };
    return { dist, walkMin, leaveBy, chip };
  }

  function fmtDist(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

  function noteKey(p) { return `jumaat:note:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; }

  function icsFor(place, leaveBy) {
    const p = klParts(leaveBy);
    const stamp = `${p.year}${p.month}${p.day}T${p.hour}${p.minute}00`;
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const body = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jumaat Finder//EN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@jumaat-finder`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
      `DTSTART;TZID=${TZ}:${stamp}`,
      "DURATION:PT1H",
      "RRULE:FREQ=WEEKLY;BYDAY=FR",
      `SUMMARY:${esc("Leave for Solat Jumaat — " + place.name)}`,
      `LOCATION:${esc(place.name)}`,
      `DESCRIPTION:${esc("Directions: https://www.google.com/maps/dir/?api=1&destination=" + place.lat + "," + place.lng)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Time to leave for Jumaat", "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = "jumaat-reminder.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- rendering ----------
  let map;
  function initMap() {
    if (!window.L) { $("map").style.display = "none"; return; }
    map = L.map("map", { zoomControl: true }).setView([3.1179, 101.6768], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(map);
  }

  function render() {
    const showSurau = $("showSurau").checked;
    const rows = state.places
      .filter((p) => showSurau || p.kind === "masjid")
      .map((p) => ({ p, plan: plan(p) }))
      .sort((a, b) => a.plan.dist - b.plan.dist);

    const list = $("list");
    list.textContent = "";
    if (map) state.markers.forEach((m) => m.remove());
    state.markers = [];

    const tpl = $("itemTpl");
    rows.forEach(({ p, plan: pl }, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector(".name").textContent = p.name;
      li.querySelector(".meta").textContent =
        `${fmtDist(pl.dist)} · ~${pl.walkMin} min walk` + (p.info ? ` · ${p.info}` : "");
      const chip = li.querySelector(".chip");
      chip.textContent = pl.chip.txt;
      chip.classList.add(pl.chip.cls);
      li.querySelector(".leave").textContent = p.kind === "masjid"
        ? `Leave by ${fmtTime(pl.leaveBy)} to walk there with ${$("bufferSelect").value} min to spare.`
          + (pl.walkMin > 25 ? " Far on foot — consider Grab/driving, but parking fills early." : "")
        : "Most surau don't hold Jumaat — confirm before going.";
      const note = store.get(noteKey(p), "");
      li.querySelector(".note-view").textContent = note ? "📝 " + note : "";

      const dest = `${p.lat},${p.lng}`;
      li.querySelector('[data-act="gmaps"]').href = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
      li.querySelector('[data-act="waze"]').href = `https://waze.com/ul?ll=${dest}&navigate=yes`;
      li.querySelector('[data-act="ics"]').addEventListener("click", () => icsFor(p, pl.leaveBy));
      li.querySelector('[data-act="note"]').addEventListener("click", () => {
        const v = prompt(`Note for ${p.name}\n(e.g. "Full by 1:05pm, overflow on level 2 car park")`, note);
        if (v === null) return;
        store.set(noteKey(p), v.trim());
        render();
      });
      list.appendChild(li);

      if (map) {
        const mk = L.circleMarker([p.lat, p.lng], {
          radius: p.kind === "masjid" ? 9 : 6,
          color: p.kind === "masjid" ? "#0f766e" : "#888",
          fillOpacity: 0.85, weight: 2,
        }).addTo(map).bindPopup(`${p.name.replace(/[<>&]/g, "")}<br>${fmtDist(pl.dist)} · ~${pl.walkMin} min walk`);
        mk.on("click", () => {
          document.querySelectorAll(".item.active").forEach((x) => x.classList.remove("active"));
          li.classList.add("active");
          li.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        state.markers.push(mk);
      }
      if (i === 0) li.classList.add("active");
    });

    if (!rows.length) {
      $("status").textContent = state.places.length
        ? "No masjid found nearby — tick “Show surau too” or pick another place."
        : $("status").textContent;
    }
  }

  async function setHere(here) {
    state.here = here;
    $("placeLabel").textContent = "Near " + here.label;
    store.set("jumaat:last", here);
    if (map) {
      map.setView([here.lat, here.lng], 15);
      if (state.hereMarker) state.hereMarker.remove();
      state.hereMarker = L.marker([here.lat, here.lng]).addTo(map).bindPopup("You are here");
    }
    $("status").textContent = "Loading prayer time and nearby mosques…";
    const [z, m] = await Promise.all([loadZuhr(here.lat, here.lng), loadMosques(here)]);
    renderHero(z);
    state.places = m.places;
    const masjids = m.places.filter((p) => p.kind === "masjid").length;
    $("status").textContent = m.offline
      ? "Couldn't reach OpenStreetMap — showing saved mosques only."
      : `${masjids} masjid within ${SEARCH_RADIUS_M / 1000} km.`;
    render();
  }

  function locate() {
    if (!navigator.geolocation) { $("status").textContent = "Location isn't available — pick a place instead."; return; }
    $("status").textContent = "Getting your location…";
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), label: "your location" }),
      () => { $("status").textContent = "Location blocked — pick a place from the list instead."; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // ---------- boot ----------
  function boot() {
    initMap();
    const sel = $("presetSelect");
    (window.JUMAAT_PRESETS || []).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      const p = (window.JUMAAT_PRESETS || []).find((x) => x.id === sel.value);
      if (p) setHere({ lat: p.lat, lng: p.lng, label: p.name });
    });
    $("btnLocate").addEventListener("click", locate);
    $("showSurau").checked = store.get("jumaat:surau", false);
    $("showSurau").addEventListener("change", () => { store.set("jumaat:surau", $("showSurau").checked); render(); });
    $("bufferSelect").value = String(store.get("jumaat:buffer", 10));
    $("bufferSelect").addEventListener("change", () => { store.set("jumaat:buffer", +$("bufferSelect").value); render(); });
    setInterval(() => { tick(); if (state.here) render(); }, 60000);

    // Start from the last place used, or Mid Valley.
    const last = store.get("jumaat:last", null);
    const start = last && last.lat ? last : { ...window.JUMAAT_PRESETS[0], label: window.JUMAAT_PRESETS[0].name };
    setHere({ lat: start.lat, lng: start.lng, label: start.label || start.name });
  }

  boot();
})();
