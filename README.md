# MyLokalEvent — Regional Event & Fishery Marketplace

Enterprise web platform connecting event organizers, local fishermen, advertisers,
and the public across Malaysian states. Built for **TEB3323 Enterprise System Development**.

**Stack:** FastAPI (Python) · Supabase (PostgreSQL) · Bootstrap 5 · Chart.js
**External APIs:** ToyyibPay (payments) · SendGrid (email) · OpenWeatherMap (weather)

---

## Project layout

```
mylokalevent_esd/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint (API + serves frontend)
│   │   ├── config.py        # env settings
│   │   ├── database.py      # Supabase client
│   │   ├── security.py      # bcrypt + JWT
│   │   ├── dependencies.py  # auth & role guards
│   │   ├── audit.py         # audit-log helper
│   │   ├── scheduler.py     # APScheduler (event/ad expiry cron)
│   │   ├── routers/         # auth, events, ads, news, fish, spots, payments, admin, analytics
│   │   ├── services/        # ToyyibPay / SendGrid / OpenWeatherMap / lifecycle
│   │   └── schemas/         # Pydantic models
│   ├── requirements.txt
│   ├── .env.example         # template — copy to .env
│   └── .env                 # your local secrets (gitignored)
├── frontend/                # Bootstrap 5 screens (served by FastAPI)
├── supabase/
│   └── schema.sql           # full DB schema + seed data
└── README.md
```

---

## Setup (local)

### 1. Create the database (one-time)
1. Go to <https://supabase.com> → create a free project (remember the DB password).
2. In the dashboard: **SQL Editor → New query** → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates all tables + seeds categories, sample fishing spots, and an admin account.
3. **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_KEY`
4. **Storage → New bucket** named `uploads` (public) for event/ad images.

### 2. Configure `.env`
Open `backend/.env` and paste your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
(External APIs are mocked by default — `MOCK_*=true` — so nothing else is required to run.)

### 3. Install & run
```powershell
cd backend
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
Open <http://localhost:8000> (frontend) and <http://localhost:8000/docs> (API explorer).

### Default admin login
```
email:    admin@mylokalevent.my
password: Admin@123      # change after first login
```

---

## Deploy live for FREE (Render)

No Hostinger purchase needed — Render's free tier gives a public HTTPS URL your
lecturer can open from home.

1. **Push to GitHub:** create a repo and push this project (see "Git" below).
2. Go to **render.com** → sign up (free) → **New** → **Blueprint** → connect your repo.
3. Render reads [`render.yaml`](render.yaml) automatically. When prompted, fill in:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (same values as your `.env`)
   - `BASE_URL` and `CORS_ORIGINS` → set both to the URL Render assigns you
     (e.g. `https://mylokalevent.onrender.com`). You'll know it after the first deploy —
     set them, then trigger a redeploy.
4. Click **Apply**. First build takes ~3–5 min. Your live URL is then public.

> Free tier note: the service sleeps after ~15 min idle and takes ~30s to wake on the
> next visit. Fine for a demo. External APIs stay mocked until you set `MOCK_*=false`
> and add the real keys in Render's dashboard.

Other hosts: a [`Dockerfile`](Dockerfile) (Fly.io/Railway) and [`Procfile`](Procfile) are included.

### Git (first push)
```powershell
cd C:\Users\eagle\mylokalevent_esd
git init
git add .
git commit -m "MyLokalEvent: full FastAPI + Supabase + Bootstrap app"
git branch -M main
git remote add origin https://github.com/<you>/mylokalevent.git
git push -u origin main
```
The `.env` and `.venv` are gitignored, so your secrets won't be pushed.

## Mapping to the 8 TEB3323 requirements
| # | Requirement | Where |
|---|---|---|
| 1 | Auth & Role Management | `routers/auth.py`, `dependencies.py`, `security.py` |
| 2 | Dashboard & Reporting | `routers/analytics.py`, frontend dashboards |
| 3 | Data Management (CRUD) | `routers/events,ads,news,fish,spots` |
| 4 | Workflow Automation | `services/lifecycle.py`, `scheduler.py`, admin approve/reject |
| 5 | External API Integration | `services/payment,email,weather` |
| 6 | Search & Filtering | `routers/events.py` query params |
| 7 | Audit & Logging | `middleware/audit.py`, `routers/admin.py` |
| 8 | Analytics & Decision Support | `routers/analytics.py`, Chart.js |
