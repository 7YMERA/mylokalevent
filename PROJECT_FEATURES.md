# MyLokalEvent — Complete Feature & System Reference

> **Purpose of this file:** a single, detailed reference of everything the
> MyLokalEvent platform does and how it is built. Hand this to another AI chat
> (or a teammate) to generate a report, slides, or documentation.
> **Keep this updated whenever new features are added.**
> _Last updated: 2026-07 (batch 9 — clean URLs, no-cache headers)._

---

## 1. Project Overview

**MyLokalEvent** is an enterprise-grade, web-based marketplace that connects
**event organizers, local fishermen's co-ops, advertisers, and the general public**
across Malaysian states and districts. It specialises in **fishing competitions,
coastal markets, and community gatherings**, and extends into a fishery marketplace
(fresh-catch listings) and a directory of recreational fishing spots (*kolam pancing*).

- **Course:** TEB3323 Enterprise System Development
- **Type:** Full-stack, deployed, real-integration web platform (not a mock)
- **Monetisation:** paid event postings, tiered banner advertising, and a prepaid credit wallet
- **Tagline:** *Regional Event & Fishery Marketplace for Malaysia*

### Problem it solves
- No centralised platform to promote regional/niche events (e.g. fishing competitions)
  in less-urbanised states (Terengganu, Kelantan, Sabah).
- Manual, slow event-approval processes.
- Organizers can't track event performance/reach/ROI.
- Advertisers lack measurable campaign data.
- No audit trail for administrative accountability.
- Fishermen's co-ops have no digital channel to market fresh catches.

---

## 2. Live Deployment

| Layer | Technology | URL |
|---|---|---|
| **Frontend** | Static Bootstrap 5 SPA | **https://mylokalevent.vercel.app** (Vercel) |
| **Backend API** | FastAPI (Python) | **https://mylokalevent.onrender.com** (Render) |
| **Database / Storage / Auth data** | Supabase (PostgreSQL) | Supabase cloud |
| **Source code** | Git | **https://github.com/7YMERA/mylokalevent** |

- **Auto-deploy:** every push to `main` redeploys both Render (backend) and Vercel (frontend).
- **Architecture is decoupled:** the frontend calls the backend over JSON/REST; CORS restricts origins.
- **Free-tier note:** the Render backend sleeps after ~15 min idle and takes ~30–50s to wake on first request; Vercel (frontend) is always instant.

---

## 3. Technology Stack

**Frontend**
- HTML5, CSS3, **Bootstrap 5**, Bootstrap Icons, Google Fonts (Poppins/Nunito)
- Vanilla JavaScript **single-page app** with hash-based routing (`#/path`)
- **Chart.js** for analytics visualisations
- Modular files: `api.js` (API client + auth), `components.js` (shared UI), `views_public.js`, `views_auth.js`, `views_dash.js`, `router.js`, `config.js` (API base)

**Backend**
- **Python + FastAPI** (RESTful JSON API), served by **Uvicorn**
- Routers: auth, events, ads, news, fish, spots, posts, payments, admin, analytics, me, meta, uploads
- Service classes: payment (Stripe), email (SendGrid), weather (OpenWeatherMap), credits, lifecycle (cron)
- **APScheduler** background jobs (event/ad expiry, ad auto-renew)
- **Pydantic** request/response validation
- **python-jose** (JWT), **bcrypt** (password hashing)

**Database & Storage**
- **Supabase** (managed PostgreSQL) via the Supabase Python client
- **Supabase Storage** bucket (`uploads`) for uploaded images

**External integrations (all real, live)**
- **Stripe Checkout** — payments (event/ad fees, credit top-ups), test mode, MYR
- **SendGrid** — transactional email
- **OpenWeatherMap** — 5-day weather forecasts on event pages

**Hosting / DevOps**
- **Vercel** (frontend), **Render** (backend, via Dockerfile), **Supabase** (DB)
- **GitHub** for version control; environment secrets stored per-host (never committed)

---

## 4. User Roles

Originally 5 roles; **advertiser was merged into organizer** (one role posts events *and* runs ads).

| Role | Can do |
|---|---|
| **General User** | Browse/search events, save favourites, view catches & fishing spots, post to community feed, comment, like, top up wallet |
| **Event Organizer** | Everything a user can + post events (paid), run ad campaigns (paid), manage own events/ads, view performance dashboard |
| **Fishermen Co-op** | Post/manage fresh-catch listings ("Catch of the Day"), mark as sold |
| **Admin** | Approve/reject events & ads, manage users (suspend/ban), view all analytics, revenue, audit logs |

- **Authentication:** custom JWT (60-min expiry) over the app's own `users` table; **bcrypt** password hashing.
- **Account lockout:** 5 failed logins → 15-minute lock.
- **Role-based access control** enforced on every protected endpoint.

---

## 5. Feature Modules (in detail)

### 5.1 Authentication & Accounts
- Register (self-service roles: user, organizer, fisherman — admin is provisioned manually)
- **Confirm-password field** with **live match feedback** (green ✓ / red ✗) that blocks submission on mismatch
- **Country-code phone picker** — a dropdown of 23 countries (**default Malaysia +60**, sorted alphabetically) + number, combined into international format on submit (e.g. `+60123456789`); used on register and profile edit
- Login with JWT issuance; wrong-password and lockout handling
- Logout (audit-logged)
- **Welcome email** on registration (SendGrid)
- **User profiles** (`/profile`): view/edit name & phone, **upload profile picture**, tabs for "My Posts" and "Saved / Joined Events"
- **Profile pictures** for every user (avatar shown in navbar, feed, comments)
- One-click **demo-account login dropdown** on the login page (Admin, Organizer 1, Organizer 2, Fishermen Co-op)

### 5.2 Events (core business entity)
- **Full CRUD** for events (create, read, update, delete)
- **Date-aware status badge:** an approved event shows **Upcoming** / **Starting soon** (≤3 days) / **Live now** / **Ended** based on its start & end dates — not a flat "Live" (the DB `status` is the approval lifecycle; the badge reflects the actual timeline)
- **Multi-step submission wizard** (Basic info → Location → Schedule & fees → Banner & payment)
- **RM10 posting fee** — pay with **Stripe** or **credits**
- **Approval workflow:** submitted → pending → admin approves (→ live) or rejects (with reason) → auto-archives after end date
- **Search & filtering** (live/responsive, no page reload): keyword, state, district, category, date range, free/paid; sort by newest/popular/upcoming; pagination; result count
- **Event detail page:** banner, description, status badge, **weather forecast** (OpenWeatherMap, Bootstrap-icon rendering), **"Get Directions"** (plain Google Maps link — no paid Maps API), **Save** button, and a **Contact Organizer** card (email/phone buttons)
- View-count tracking
- Emails: **event submitted (pending approval)**, **approved**, **rejected** — to the organizer

### 5.3 Advertising System (old-Roblox-inspired)
- **4 purchasable placement types with tiered 7-day pricing** — each ad shows **only** in the placement it bought (strict; no leaking across spots):
  | Placement | Where it shows | Price / 7 days |
  |---|---|---|
  | **Top banner** | Full-width strip near the top of the homepage | **RM130** |
  | **Featured** | Boosts the promoted event to the front of homepage Featured Events (external-link featured ads show as the sponsored strip) | **RM70** |
  | **Feed post** | Native sponsored post inside the community feed | **RM50** |
  | **Side banner** | Events & Catch-of-the-Day sidebar rail | **RM40** |
- **Sponsored page** (`/sponsored`) is **not a purchasable placement** — it's a **free showcase that lists every active ad** regardless of placement (a bonus for all sponsors)
- Ad creation form with **live price** that updates by placement; banner upload; contact details; the **"promote which event?"** picker lists **only the organizer's live events** (expired/pending hidden)
- **Organizer dashboard = campaigns at a glance:** a compact **read-only** summary card sits **beside "My Events"** — status counts (Active / Expiring / Expired), a short campaign list (placement · CTR · auto-renew · days-left), and totals (impressions / clicks / avg CTR), with a **"Manage →"** button to the full campaigns page. No editing on the dashboard.
- **Campaign management page** (`/advertiser`): filter tabs (**All / Active / Expiring soon / Expired**) with live counts, an **"Ends" date** column, an **"expiring soon" badge**, and a per-ad **Auto-renew** badge
- **Campaign detail modal** (on the management page): click any campaign to see all its fields (status, placement, promoted event/link, description, contact, run dates, auto-renew, impressions/clicks/CTR) with an **inline banner uploader** that updates the ad image **live** (PUT), reflected in the modal and the table
- **No manual dates** — runs 7 days from creation (start date shown)
- **Auto-renew toggle:** charges the placement price in **credits** every 7 days; **stops automatically** when credits run out (with email)
- Pay ad fee with **Stripe** or **credits**
- **Admin approval** required before an ad goes live
- **Placement rendering:** homepage top banner + featured strip, **events & Catch-of-the-Day sidebar "Sponsored" rail** (a few rotating ads), dedicated **Sponsored page** (nav link)
- **Sponsored featured events:** events promoted by a **featured-placement** ad are **boosted to the front of the homepage's Featured Events** as "Sponsored" cards (up to 3); their clicks route through the ad's click endpoint so the campaign is credited (impression + click). Only featured-placement ads qualify — a top/side/feed ad never appears here.
- **Native sponsored feed posts** (`feed` placement): advertisers publish a **social-media-style promoted post** — headline + caption + image + "View Event" button — that's **interleaved among the real community posts** (one after every few posts, shuffled per load). Looks like an organic post but tagged "Sponsored"; the CTA redirects to the promoted event.
- **Ads promote an event** (Roblox-style): the organizer picks which of their events an ad promotes, and **clicking the ad redirects to that event's page** (external URL kept as an optional fallback). Ad cards show "Promoting: [Event]" with a "View Event" button.
- **Rotation:** each banner slot (top/featured/side) shows a **random active ad of that placement on every page load** (ad-network style); the Sponsored page lists them all. Only **admin-approved (active)** ads are shown.
- **Click-through tracking** (redirect) + **impression tracking** (counted on display); CTR shown on the dashboard
- Emails: **ad approved/rejected**, **ad expiring soon**, **ad auto-renewed / stopped (out of credits)**

### 5.4 Prepaid Credit Wallet ("Claude-style" billing)
- **1 credit = RM1**, virtual and non-cashable (top-up only, no withdrawal)
- **Wallet page** (`/wallet`) + **balance shown in the navbar**
- **Top up** with preset amounts (RM20/50/100/200) or custom → **Stripe Checkout**
- **Spend credits** seamlessly on event/ad fees (or fall back to card)
- **Transaction history** (top-ups, event fees, ad fees, ad renewals) with running balance
- Powers **ad auto-renew**
- **Low-balance reminder email** (with a demo trigger button)

### 5.5 Community (social hub)
- **Dedicated `/community` page** (its own nav item): the full feed with a **filter sidebar** (by state), composer, **pagination**, and a Sponsored ad rail. The homepage shows a compact **"From the Community"** preview that links into it.
- **Posts:** share activities/catches with caption, **uploaded photo**, **location tag** (state/district), and **"joining this event"** tag (cascades — pick a state to filter the event list)
- **Likes** (emails the post author)
- **Comments** (inline expandable panel, with author avatars, delete own; emails the post author)
- **Native sponsored posts** (feed-placement ads) interleaved among the real posts
- Post author's **profile picture** shown on each card
- Composer for logged-in users; location tags link to filtered events

### 5.6 Fishery Marketplace
- **Catch of the Day** board (Events-style layout): filter **sidebar** (species, location, max price/kg, **availability: available-only / include-sold**, sort by newest / price low→high / high→low) with **live in-place filtering**, result count, and pagination; plus a **Sponsored ad rail**
- **Catch cards** show an **Available / Sold** badge and are **clickable → a detail modal** with full info and a **"Contact the seller"** section (email / phone)
- **Fishing Spots Directory** (*kolam pancing*, Events-style layout): filter **sidebar** (keyword/name, state, district) with **live in-place filtering** and a result count, a **Sponsored ad rail**, and a **"Get Directions"** Google Maps link per spot (no paid Maps API)
- **Community-suggested spots:** fishermen & organizers can **"Suggest a spot"** (name, description, state/district, Google Maps link); submissions are **held for admin approval** (hidden until approved), while admins publish instantly. Admin **Pending Spots** queue (sidebar page + live count badge) with approve / reject

### 5.7 Payments
- **Stripe Checkout** (hosted, MYR): event fees, ad fees, credit top-ups
- Test card `4242 4242 4242 4242`
- Payment verified via return page (queries Stripe) + **webhook** (`checkout.session.completed`)
- **Credits** as an alternative instant payment method
- Invoice email on successful payment

### 5.8 Notifications + email
- **In-app notifications** are the primary, reliable signal — a notifications feed on the dashboard (event/ad/spot approved, etc.). They never depend on external email delivery.
- **Email (best-effort)** via a provider **fallback chain**: **SMTP → Brevo → Resend** (first configured wins; next tried only if one fails). SMTP (Gmail App Password) delivers to the inbox; Brevo/Resend are HTTP fallbacks for hosts that block SMTP. *(SendGrid was dropped — it accepted mail but silently never delivered from a Gmail sender due to DMARC.)*
- **Demo email routing:** emails to **fake seeded accounts** (`@demo.mylokalevent.my`, `admin@…`) are **redirected to a demo inbox** with a "demo redirect" banner; real registered users get their own email.
- **Demo trigger buttons** raise reminders live as **in-app notifications** (+ best-effort email): 🔔 "Notify me: expiring soon" on a campaign (in the detail modal), and "Notify me: low balance" on the wallet.

### 5.9 Weather
- **OpenWeatherMap** 5-day forecast injected into event detail pages
- Weather icons rendered via **Bootstrap Icons** (mapped from the weather code) for reliability

### 5.10 Admin & Analytics
- **Admin dashboard (full operations console):** **8 KPI cards** (total events, pending events, revenue, active ads, total users, fish catches, payments, avg ad CTR) + **four Chart.js charts** (events by state, monthly revenue, events by category, catch landings by species) + a **Top Ad Campaigns** table (clicks/impressions/CTR), a **Recent Activity** feed (live audit trail), and a **Newest Members** table
- **Pending Events**, **Pending Ads**, and **Pending Spots** as dedicated sidebar pages with **live count badges**; approve/reject
- **User management:** list users, change status (active/suspended/banned)
- **Analytics endpoints:** dashboard KPIs, events-by-state, events-by-category, monthly revenue, ad CTR, catch-volume trends
- **Audit log viewer** with **action filter chips** (All + one per action, each showing a live count — CREATE/UPDATE/DELETE/APPROVE/LOGIN/…), a User-ID filter, and **CSV export**; actions shown with **name + email** (not raw IDs)

### 5.11 Audit & Logging
- Every state-changing action (CREATE/UPDATE/DELETE/APPROVE/REJECT/LOGIN/LOGOUT/EXPORT) is logged with user, IP, user-agent, timestamp, and old/new values
- Admin audit viewer + CSV export

### 5.12 Notifications
- In-app notifications table; surfaced in the **organizer dashboard notifications widget** (mark-as-read)

### 5.13 Image Uploads
- Upload images from device to **Supabase Storage** (event banners, ad banners, catch photos, community posts, profile pictures); returns public URL; 5 MB limit; JPG/PNG/WEBP/GIF

---

## 6. Mapping to the 8 TEB3323 Functional Requirements

| # | Requirement | How it's met |
|---|---|---|
| 1 | **User Auth & Role Management** | JWT + bcrypt, 4 roles, RBAC guards, lockout, profiles |
| 2 | **Dashboard & Reporting** | Admin KPI dashboard + charts; organizer/advertiser/fisherman dashboards |
| 3 | **Data Management (CRUD)** | Events, ads, news, fish catches, fishing spots, categories, posts, comments |
| 4 | **Workflow Automation** | Payment → pending → approve → live → archive; APScheduler cron (expiry, auto-renew) |
| 5 | **External API Integration** | Stripe (payments), SendGrid (email), OpenWeatherMap (weather), Supabase (DB/Storage) |
| 6 | **Search & Filtering** | Live event filter (state/district/category/date/fee), pagination, sort |
| 7 | **Audit & Logging** | Full audit trail + admin viewer + CSV export |
| 8 | **Analytics & Decision Support** | KPI charts (revenue, districts, CTR, catch trends) |

> Note: the original proposal named ToyyibPay for payments; the implementation
> uses **Stripe** (easier, better test mode). This is an improvement, not a gap.

---

## 7. Database Schema (Supabase / PostgreSQL)

Main tables:
- **users** — id, name, email, password (bcrypt), role, status, phone, profile_image, **credits**, failed_attempts, locked_until, created_at
- **categories** — event/news categories
- **events** — organizer_id, title, description, category, state, district, location_url, start/end dates, entry_fee, banner_url, status (pending/approved/rejected/live/expired), payment_id, view_count, reject_reason
- **advertisements** — advertiser_id, title, description, image_url, target_url, start/end dates, amount_paid, clicks, impressions, **auto_renew**, **placement**, status (pending/active/expired/rejected), contact_email, contact_phone
- **news** — author, title, body, category, image, published
- **fish_catches** — user, species, weight_kg, price_per_kg, location, catch_date, image, is_available
- **fishing_spots** — name, description, state, district, maps_url, is_active
- **payments** — user, payable_type (event/advertisement/topup), payable_id, amount, method, status, transaction_id (Stripe session)
- **credit_transactions** — user, amount (±), type (topup/event/advertisement/ad_renewal), description, balance_after
- **audit_logs** — user, action, table, record_id, old/new value (JSON), ip, user_agent
- **notifications** — user, title, body, is_read
- **saved_events** — user↔event bookmarks (junction)
- **posts** — user, caption, image, state, district, event_id, likes
- **post_comments** — post, user, body

---

## 8. API Endpoints (REST, prefix `/api`)

**Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
**Events:** `GET /events`, `POST /events`, `GET/PUT/DELETE /events/{id}`, `POST/DELETE /events/{id}/save`
**Ads:** `GET /advertisements`, `POST /advertisements`, `GET /advertisements/mine`, `GET /advertisements/pricing`, `PUT/DELETE /advertisements/{id}`, `GET /advertisements/{id}/click`, `POST /advertisements/{id}/impression`, `POST /advertisements/{id}/remind-expiry`
**News:** `GET/POST /news`, `GET/PUT/DELETE /news/{id}`
**Fish catches:** `GET/POST /fish-catches`, `GET /fish-catches/mine`, `PUT/DELETE /fish-catches/{id}`, `POST /fish-catches/{id}/sold`
**Fishing spots:** `GET/POST /spots`, `GET/PUT/DELETE /spots/{id}`
**Community:** `GET/POST /posts`, `DELETE /posts/{id}`, `POST /posts/{id}/like`, `GET/POST /posts/{id}/comments`, `DELETE /posts/comments/{id}`
**Wallet / me:** `GET /me/wallet`, `POST /me/wallet/topup`, `POST /me/wallet/remind-low`, `GET/PUT /me/profile`, `GET /me/posts`, `GET /me/saved-events`, `GET /me/notifications`, `POST /me/notifications/{id}/read`, `GET /me/organizer-summary`, `GET /me/advertiser-summary`, `GET /me/fisherman-summary`
**Payments:** `GET /payment/return`, `POST /payment/stripe-webhook`, `GET /payment/{id}`
**Admin:** `GET /admin/events/pending`, `POST /admin/events/{id}/approve|reject`, `GET /admin/advertisements/pending`, `POST /admin/advertisements/{id}/approve|reject`, `GET /admin/users`, `PUT /admin/users/{id}/status`
**Analytics:** `GET /analytics/dashboard`, `/events-by-state`, `/events-by-category`, `/revenue-monthly`, `/ad-ctr`, `/catch-trends`, `/audit-logs`, `/audit-logs/export`
**Utility:** `GET /categories`, `POST /categories`, `GET /weather`, `POST /upload`, `GET /health`

---

## 9. Security

- bcrypt password hashing; JWT bearer tokens (60-min expiry)
- Role-based middleware on protected routes; admin-only guards on approvals
- Pydantic input validation; parameterised queries via Supabase client
- Account lockout after 5 failed logins
- Automatic audit logging of all state changes
- Stripe payment verification (return + webhook); credits spent server-side with balance checks
- Strict CORS allow-list; stateless JWT (no session cookies)
- Secrets stored in host env vars (never committed; `.env` is gitignored)

---

## 10. Business Model & Monetisation

- **Event posting fee:** RM10 per event
- **Tiered ad pricing** by placement (RM40–RM130 / 7 days) — premium real estate costs more
- **Auto-renew** ads → recurring, subscription-style revenue
- **Prepaid credit wallet** → cash upfront + breakage on unused credits
- **Profit levers:** premium-placement pricing + recurring renewals + prepaid float
- Access stays **free** for the public and fishermen's co-ops (digital inclusion)

---

## 11. Demo Guide

**Live site:** https://mylokalevent.vercel.app

**Demo accounts** (login page has a one-click "Demo accounts" dropdown):
| Role | Email | Password |
|---|---|---|
| Admin | admin@mylokalevent.my | Admin@123 |
| Organizer 1 | tac@demo.mylokalevent.my | Pass@123 |
| Organizer 2 | ppt@demo.mylokalevent.my | Pass@123 |
| Fishermen Co-op | nck@demo.mylokalevent.my | Pass@123 |

- Demo organizers start with **RM300 credits**.
- Stripe test card: **`4242 4242 4242 4242`**, any future expiry, any CVC.
- **Emails from demo accounts** are redirected to `muhammad_22001874@utp.edu.my`.
- A **real account** (e.g. the lecturer registering) receives emails at **their own address**.

**Suggested demo flow:**
1. Browse homepage (top banner + featured ads), events (filter live), Sponsored page, Catch of the Day, Fishing Spots.
2. Log in as **Organizer 2** → dashboard shows events + ad campaigns + notifications; open Wallet (RM300).
3. Create an ad → pick "Top banner" (price jumps to RM130), toggle auto-renew, pay with credits.
4. Post an event → pay with credits or Stripe test card.
5. Use the 🔔 buttons to send "ad expiring" / "low balance" emails → check the UTP inbox.
6. Log in as **Admin** → approve the pending event/ad, view analytics charts, audit log (CSV export).
7. Post to the community feed, comment, like.

---

## 12. Notable Engineering Decisions

- **Decoupled deploy** (Vercel + Render + Supabase) instead of a single server — matches the "decoupled frontend" design and keeps the frontend always-fast.
- **Stripe over ToyyibPay** — instant test mode, better docs, no business verification.
- **Custom JWT auth** over Supabase Auth — full control of the 5-role model, lockout, and audit logging.
- **Bootstrap-icon weather** instead of OpenWeatherMap's image CDN (which was unreliable/blocked).
- **Credits are virtual/non-cashable** — avoids real-money withdrawal concerns while enabling a rich economy.
- **Demo email redirect** — lets fake accounts' emails be demoed while real users get real delivery.
- **Clean URLs (History API routing)** — real paths like `/wallet`, `/events/5` (no `#` hash); Vercel rewrites all paths to `index.html`, and `no-cache` headers on JS/CSS guarantee the latest code loads after every deploy.

---

_End of reference. Update this file whenever features change so it stays the single source of truth for the report and slides._
