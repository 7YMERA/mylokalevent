# MyLokalEvent — Change Log for Report & Slides

**Purpose:** hand-off note for the team updating the **report** and **slides**.
It lists what changed recently, why, and **where each change should be reflected**
in the report/deck. The full, current feature list lives in
[`PROJECT_FEATURES.md`](../PROJECT_FEATURES.md) (the source of truth) — this file
is just the "what's new / what to update" summary.

**As of:** 2026-07-20 · **Live URLs:** frontend `https://mylokalevent.vercel.app` ·
API `https://mylokalevent.onrender.com` · DB Supabase.

> TL;DR for the report/slides team: the **advertising system** grew a lot (native
> feed ads, sponsored events, a sidebar ad rail, campaign lifecycle management),
> **Catch of the Day** became a filterable marketplace like the Events page, the
> **admin dashboard** became a full operations console, and **registration** got a
> confirm-password field and a country-code phone picker. Update the ad section,
> the Catch of the Day section, the admin/analytics section, and the registration
> screenshots.

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

### Current ad placement pricing (update the pricing table in the report/deck)
| Placement | Where it shows | Price / 7 days |
|---|---|---|
| Top banner | Strip near the top of the homepage/pages | RM130 |
| Sponsored page | Dedicated `/sponsored` showcase page | RM90 |
| Featured | Homepage strip + listings | RM70 |
| **Feed post (NEW)** | Native sponsored post in the community feed | **RM50** |
| Side banner | Events / Catch-of-the-Day sidebar rail | RM40 |

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

## Quick "what to update" checklist

**Report:**
- [ ] Advertising section: add feed placement, sponsored events, sidebar rail,
      campaign lifecycle (filters/expiry/auto-renew), updated pricing table (5 tiers).
- [ ] Search & Filtering (Req 6): add Catch of the Day filters.
- [ ] Dashboard & Reporting (Req 2) + Analytics (Req 8): describe the expanded admin console.
- [ ] Authentication: confirm-password + country-code phone.
- [ ] Refresh the pricing table and any "number of ad placements" (now **5**).

**Slides (new/updated screenshots):**
- [ ] Homepage (sponsored featured events + top banner)
- [ ] Community feed (native sponsored post)
- [ ] Events page (3-ad sidebar rail)
- [ ] Catch of the Day (filters + results)
- [ ] Admin dashboard (8 KPIs, 4 charts, tables)
- [ ] Organizer "My Ad Campaigns" (filter tabs + badges)
- [ ] Registration (confirm password + country-code phone)

---

## Reference: commits behind these changes (2026-07-20)
- `e652915` — Ad campaigns: live-only promote picker + lifecycle filters & badges
- `67dedff` — Dashboard profile avatar centering
- `5007f5c` — Sidebar ad rail, filterable Catch of the Day, richer admin dashboard
- `05866cb` — Ads always redirect clicks to the promoted event (not placeholder URL)
- `39460a9` — Register phone: alphabetical country codes (MY +60 default)
- `f3479f2` — Sponsored featured events + native sponsored feed posts
- `3c4efd6` — Ad random rotation per page load + impressions on display
- `9ac9ad4` — Phone country-code dropdown (register + profile)
- `2ec83fa` — Register confirm-password field with live match validation
