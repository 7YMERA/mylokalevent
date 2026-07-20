# MyLokalEvent — Change Log for Report & Slides

**Purpose:** hand-off note for the team updating the **report** and **slides**.
It lists what changed recently, why, and **where each change should be reflected**
in the report/deck. The full, current feature list lives in
[`PROJECT_FEATURES.md`](../PROJECT_FEATURES.md) (the source of truth) — this file
is just the "what's new / what to update" summary.

**As of:** 2026-07-20 · **Live URLs:** frontend `https://mylokalevent.vercel.app` ·
API `https://mylokalevent.onrender.com` · DB Supabase.

> TL;DR for the report/slides team: the **advertising system** grew a lot (native
> feed ads, sponsored events, a sidebar ad rail, campaign lifecycle management,
> **strict placement**), **Catch of the Day** and **Fishing Spots** became
> filterable marketplaces like the Events page, the **admin dashboard** became a
> full operations console, and **registration** got a confirm-password field and a
> country-code phone picker.
>
> **Round 2 (see §6 below):** ad placements are now **strict** (an ad shows only where
> it was bought) and **Sponsored is a free showcase, not a paid tier**; the organizer
> dashboard is a **read-only summary** with full management on `/advertiser`; **events
> show a date-aware status** (Upcoming / Starting soon / Live now / Ended); users can
> **suggest fishing spots** (admin-approved); **Catch of the Day cards are clickable**
> with a contact-seller section + availability; and ad approve/reject now **emails**
> the advertiser. Read §6 first — it corrects a few things above (esp. the pricing table).

---

## 1. Advertising system — major additions

### 1a. Native "sponsored community post" (new `feed` placement)
Advertisers can publish a **social-media-style promoted post** (headline + caption
+ image + "View Event" button) that is **interleaved among the real community-feed
posts** (one after every few posts, shuffled per load) and tagged **"Sponsored"**.
The CTA redirects to the promoted event. Reuses the full ad lifecycle (create → pay
→ admin approve → active) and counts impressions/clicks.
- **Pricing:** RM50 / 7 days (new tier).
- **Report impact:** Add to the *Advertising* feature section; add a bullet under
  *External-facing / social features*. Mention it as a 5th ad placement type.
- **Slides impact:** New screenshot of a sponsored post in the community feed.

### 1b. Sponsored featured events
Events that an **active ad campaign is promoting** are **boosted to the front of the
homepage "Featured Events"** as **"Sponsored"** cards (up to 3). Their clicks route
through the ad's click endpoint, so the campaign is credited (impression + click).
- **Report impact:** Advertising section — explain "boosted listings" concept.
- **Slides impact:** Homepage screenshot now shows sponsored event cards.

### 1c. Sidebar "Sponsored" ad rail (Events + Catch of the Day)
The single side-banner ad on the Events page is now a **rail of up to 3 rotating
ads**, and the **Catch of the Day** page has the same rail.
- **Report impact:** Advertising placements — note the sidebar rail.
- **Slides impact:** Update Events-page screenshot (sidebar now shows 3 ads).

### 1d. Ad rotation is random per page load (+ impressions counted on display)
Each banner slot shows a **random active ad of that placement on every page load**
(ad-network style). Impressions are now counted **on display**, and clicks
separately — so **CTR is accurate**.
- **Report impact:** Advertising / Analytics — CTR methodology.
- **Slides impact:** Optional; mention on the analytics slide.

### 1e. Ad clicks always go to the promoted event (bug fix)
Previously some demo ads had a placeholder `target_url` (`example.com`). Now **every
ad redirects to its promoted event's page**; the placeholder URLs were cleared and
the seeders link each ad to an event.
- **Report impact:** none needed (correctness fix); optional footnote.

### 1f. "Create Ad" — promote picker shows only LIVE events
The *"Promote which event?"* dropdown now lists **only the organizer's live events**
(expired/pending are hidden).
- **Report impact:** Ad-creation workflow description.

### 1g. Campaign lifecycle management (organizer dashboard)
"My Ad Campaigns" now has:
- **Filter tabs:** All / Active / **Expiring soon** / Expired (with live counts).
- An **"Ends" date** column.
- An **"expiring soon" badge** (≤ 2 days left / "ends today").
- A per-campaign **Auto-renew vs No-auto-renew** badge.
- **Report impact:** Advertising / Workflow-automation section (lifecycle + auto-renew).
- **Slides impact:** Screenshot the campaign table with the filter tabs + badges.
- ⚠️ **Updated in Round 2 (§6b):** this full table + detail modal now lives on the
  **`/advertiser` management page**. The organizer **dashboard** shows a compact
  **read-only** summary beside "My Events" with a **"Manage →"** button.

### 1h. Campaign detail modal + live banner update
Clicking any campaign (title, thumbnail, or the eye button) opens a **detail
modal** showing every field the advertiser entered (status, placement, promoted
event/link, description, contact, run dates, auto-renew, and impressions/clicks/
CTR). It includes an **inline banner uploader** that swaps the ad image **live**
(saved via `PUT /advertisements/{id}`) — the new banner shows immediately in the
modal and the table.
- **Report impact:** Advertising / Data-management (CRUD) — ads are now editable
  (banner) from a detail view, not just create/delete.
- **Slides impact:** Screenshot the campaign detail modal.

### Current ad placement pricing ⚠️ UPDATED in Round 2 — use this table
There are now **4 purchasable placements** (the old "Sponsored" tier was removed).
| Placement | Where it shows | Price / 7 days |
|---|---|---|
| Top banner | Full-width strip near the top of the homepage | RM130 |
| Featured | Boosts the promoted event to the front of homepage Featured Events | RM70 |
| Feed post | Native sponsored post in the community feed | RM50 |
| Side banner | Events / Catch-of-the-Day / Fishing-Spots sidebar rail | RM40 |

**Sponsored page (`/sponsored`) is NOT a purchasable placement** — it's a **free
showcase that lists every active ad** regardless of placement (a bonus for all
sponsors). See §6a.

---

## 2. Catch of the Day — now a filterable marketplace (like Events)
Rebuilt from a plain grid into the **Events-style two-column layout**:
- **Filter sidebar:** species, location, **max price/kg**, **sort** (newest /
  price low→high / high→low), with **live in-place filtering**, a result count,
  and **pagination**.
- A **Sponsored ad rail** in the sidebar.
- **Backend:** the `GET /fish-catches` endpoint gained `sort` and `max_price` params.
- **Report impact:** *Fishery Marketplace* + *Search & Filtering (Requirement 6)* —
  Catch of the Day now demonstrates search/filter too, not just Events.
- **Slides impact:** Replace the old Catch-of-the-Day screenshot.

---

## 3. Admin dashboard — full operations console
Expanded from **4 KPIs + 3 charts** to:
- **8 KPI cards:** total events, pending events, revenue, active ads, **total users,
  fish catches, payments, average ad CTR**.
- **4 charts:** events by state, monthly revenue, events by category, **catch
  landings by species (new)**.
- **Top Ad Campaigns** table (clicks / impressions / CTR).
- **Recent Activity** feed (live audit trail).
- **Newest Members** table.
- **Report impact:** *Dashboard & Reporting (Req 2)* and *Analytics & Decision
  Support (Req 8)* — richer admin analytics.
- **Slides impact:** Replace the admin-dashboard screenshot (now much fuller).

### 3a. Audit Logs — action filter chips (was a dropdown)
The Audit Logs page's Action dropdown is now a row of **filter chips** (All + one
per action, each with a **live count** — e.g. LOGIN 55, CREATE 19, UPDATE 10 …),
matching a category-filter pattern. Backed by a new
`GET /analytics/audit-logs/summary` endpoint. User-ID filter and CSV export remain.
- **Report impact:** *Audit & Logging (Req 7)* — describe the chip filter + counts.
- **Slides impact:** Screenshot the audit log with the chip bar.

---

## 4. Registration & Profile
### 4a. Confirm-password field
Registration now has a **Confirm Password** field with **live match feedback**
(green "✓ match" / red "do not match") and blocks submission on mismatch.
- **Report impact:** *Authentication & Accounts* / *Validation*.
- **Slides impact:** Update the registration screenshot.

### 4b. Country-code phone picker
The phone input is a **country-code dropdown + number** (23 countries, **default
Malaysia +60**, sorted **alphabetically**). On submit it combines to an
international format (e.g. `+60123456789`, strips a leading 0). Used on **register**
and **profile edit**.
- **Report impact:** *Authentication & Accounts* / data-quality.
- **Slides impact:** Registration screenshot shows `[ MY +60 ▾ ][ number ]`.

---

## 5. UI consistency
- **Dashboard profile card:** the avatar is now **centered** with the name below
  (previously an uploaded photo sat left-aligned). Consistent for both the uploaded
  image and the initials fallback.
- **Report impact:** none needed. **Slides:** any dashboard screenshot looks tidier.

---

## 6. Round 2 changes (later on 2026-07-20)
Everything below is newer than §1–§5 and, where noted, **supersedes** them.

### 6a. Strict ad placement + Sponsored is a free showcase
An ad now shows **only in the placement it bought** — no leaking across spots. (Bug
before: a Top-banner ad also appeared in the side rail and the featured cards.)
- **"Sponsored" is no longer a purchasable placement.** The `/sponsored` page is a
  **free showcase listing every active ad** regardless of placement.
- Purchasable placements are now **4**: Top, Featured, Feed, Side (see the pricing
  table above).
- **Report impact:** Advertising section — replace "5 placements" with **4 purchasable
  placements + a free Sponsored showcase**; update the pricing table; add "strict
  placement" as a correctness/《fairness》 point.
- **Slides impact:** none new, but ensure the pricing slide matches the table above.

### 6b. Organizer dashboard = read-only summary; management on `/advertiser`
The organizer dashboard's "My Ad Campaigns" is now a **compact, read-only summary
card sat beside "My Events"** — status counts (Active / Expiring / Expired), a short
campaign list (placement · CTR · auto-renew · days-left), and totals — with a
**"Manage →"** button. All **editing** (full table, filter tabs, campaign detail modal,
live banner update) lives on the dedicated **`/advertiser`** page. Supersedes §1g/§1h's
"on the dashboard" framing.
- **Report impact:** Dashboard/UX — "glanceable dashboard, dedicated management page".
- **Slides impact:** Re-screenshot the organizer dashboard (events + summary side-by-side)
  and the `/advertiser` page (the full table + modal live there now).

### 6c. Date-aware event status badge
An approved event no longer shows a flat "Live". Based on its start/end dates it shows
**Upcoming**, **Starting soon** (≤3 days), **Live now**, or **Ended**. (The DB `status`
is the approval lifecycle; the badge reflects the actual timeline.)
- **Report impact:** Events section — note the derived status display.
- **Slides impact:** Event-card/detail screenshots now show these labels.

### 6d. Fishing Spots — filterable + community submissions
- The **Fishing Spots Directory** was rebuilt Events-style: filter sidebar (keyword,
  state, district), live filtering, result count, and a sidebar ad rail.
- **New:** fishermen & organizers can **"Suggest a spot"** (name, description,
  state/district, Google Maps link). Submissions are **held for admin approval**
  (hidden until approved); admins publish instantly. New admin **Pending Spots** queue
  (sidebar page + live count badge) with approve/reject. *(No DB migration — uses the
  existing `is_active` flag as the approval gate.)*
- **Report impact:** *Data Management (Req 3)* + *Workflow Automation (Req 4)* — a
  second admin-approval pipeline (alongside events & ads); *Search & Filtering (Req 6)*
  — spots are now filterable too.
- **Slides impact:** Fishing Spots page (filters + "Suggest a spot"), the suggest modal,
  and the admin Pending Spots queue.

### 6e. Catch of the Day — clickable cards, contact, availability
Extends §2. Each catch card now shows an **Available / Sold** badge and is
**clickable → a detail modal** with full info and a **"Contact the seller"** section
(email / phone). Added an **availability filter** (available-only / include-sold).
New `GET /fish-catches/{id}` returns the catch enriched with the seller's contact.
- **Report impact:** Fishery Marketplace — buyer↔seller contact + availability.
- **Slides impact:** Catch detail modal (contact section + Available/Sold badge).

### 6f. Ads now email on approve/reject
Ad approval/rejection previously only made an in-app notification — **no email**. Now
the advertiser is emailed on **approve** and **reject** (like events), via the same
SendGrid demo-redirect.
- **Report impact:** *External API Integration (Req 5)* / notifications — ad emails now
  match the events flow (the earlier "ad approved/rejected email" claim is now actually true).

### 6g. Fixes & deploy notes (no report change needed)
- **Audit Logs stuck spinner** fixed (a `<div>` spinner inside `<tbody>` was being
  foster-parented out and never replaced).
- **Navbar credit balance** now refreshes after a wallet top-up (the app re-syncs the
  cached user on load and on the wallet page — the Stripe return reload previously left
  the balance stale).
- **Admin dashboard** chart heights made uniform (the doughnut had ballooned, leaving a
  gap); organizer dashboard gained a **Manage Campaigns** link.
- **Deploy note for the demo:** for demo-account approval emails to arrive, Render must
  have `DEMO_EMAIL_REDIRECT`, `SENDGRID_API_KEY`, and `MOCK_EMAIL=false` set. SendGrid
  mail from a Gmail sender can land in **spam** at university domains — check junk.

---

## Quick "what to update" checklist

**Report:**
- [ ] Advertising: feed placement, sponsored events, sidebar rail, campaign lifecycle
      (filters/expiry/auto-renew), **strict placement**, and the **4-tier** pricing table
      (Sponsored is a free showcase, not a paid tier).
- [ ] Advertising/UX: organizer dashboard = read-only summary; management on `/advertiser`.
- [ ] Events: **date-aware status** (Upcoming / Starting soon / Live now / Ended).
- [ ] Search & Filtering (Req 6): Catch of the Day **and** Fishing Spots filters.
- [ ] Data Mgmt (Req 3) + Workflow (Req 4): **community-suggested fishing spots** with
      admin approval (a 3rd approval pipeline after events & ads).
- [ ] Fishery Marketplace: catch cards clickable → contact-seller + Available/Sold.
- [ ] Dashboard & Reporting (Req 2) + Analytics (Req 8): expanded admin console + audit chips.
- [ ] External API (Req 5): ad approve/reject emails now sent (match events).
- [ ] Authentication: confirm-password + country-code phone.

**Slides (new/updated screenshots):**
- [ ] Homepage (sponsored featured events + top banner)
- [ ] Community feed (native sponsored post)
- [ ] Events page (3-ad sidebar rail) — event cards show new date-aware badges
- [ ] Catch of the Day (filters + results) + a **catch detail modal** (contact + Sold/Available)
- [ ] Fishing Spots (filters + "Suggest a spot") + admin **Pending Spots** queue
- [ ] Admin dashboard (8 KPIs, 4 charts, tables) + **Audit Logs chip filters**
- [ ] Organizer dashboard (summary beside My Events) + **`/advertiser`** page (full table + detail modal)
- [ ] Registration (confirm password + country-code phone)

---

## Reference: commits behind these changes (2026-07-20)
**Round 2 (newest first):**
- `45a9f82` — Fix stale navbar credit balance after wallet top-up
- `a8e0941` — Community-suggested fishing spots + richer Catch of the Day (clickable/contact/availability)
- `0458055` — Ads: strict placement (Sponsored no longer purchasable = free showcase)
- `33417bd` — Events: date-aware status badge (Upcoming / Starting soon / Live now / Ended)
- `434304f` — Document DEMO_EMAIL_REDIRECT + verified-sender note
- `b03a5c0` — Send approval/rejection emails for ads (were missing)
- `9dd067b` — Fix stuck spinner on Audit Logs page
- `05c79e4` — Fishing Spots: Events-style filter sidebar + ad rail
- `77e214d` — Organizer dashboard: read-only campaigns summary beside My Events
- `8232787` — Organizer → /advertiser link; admin dashboard chart-height fix
- `ddc002c` — Advertiser page: same campaign lifecycle tabs & badges

**Round 1:**
- `cef6387` — Audit-log chip filters + campaign detail modal with live banner update
- `e652915` — Ad campaigns: live-only promote picker + lifecycle filters & badges
- `67dedff` — Dashboard profile avatar centering
- `5007f5c` — Sidebar ad rail, filterable Catch of the Day, richer admin dashboard
- `05866cb` — Ads always redirect clicks to the promoted event (not placeholder URL)
- `39460a9` — Register phone: alphabetical country codes (MY +60 default)
- `f3479f2` — Sponsored featured events + native sponsored feed posts
- `3c4efd6` — Ad random rotation per page load + impressions on display
- `9ac9ad4` — Phone country-code dropdown (register + profile)
- `2ec83fa` — Register confirm-password field with live match validation
