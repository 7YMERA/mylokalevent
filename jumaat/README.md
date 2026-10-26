# Jumaat Finder

A small mobile web app for finding somewhere to pray **Solat Jumaat** near you,
built for busy places like Mid Valley KL where it is hard to know which mosque
to go to and when to leave.

## What it does
- **Countdown** to this Friday's Zuhr / azan Jumaat (JAKIM times via
  [waktusolat.app](https://waktusolat.app), auto zone from GPS, falls back to WLY01).
- **Nearby masjid** within 3 km from OpenStreetMap, sorted by distance, with
  walking time. Surau are hidden by default, since most don't hold Jumaat.
- **"Leave by" time** for each mosque, using walk time plus a buffer you choose,
  with an *On track / Leave now / Too late on foot* status.
- **Directions** in Google Maps or Waze, and a **weekly Friday reminder** (.ics)
  for your calendar.
- **Personal notes** per mosque (e.g. "full by 1:05pm, overflow at car park L2"),
  saved on your phone.
- Works without GPS: pick Mid Valley, The Gardens, Bangsar South, KL Sentral or KLCC.

## Run it
It is plain static files, with no build step and no backend:

```bash
cd jumaat && python3 -m http.server 8000   # open http://localhost:8000
```

Deploy the `jumaat/` folder to any static host (Vercel, Netlify, GitHub Pages).
GPS needs HTTPS (or localhost).

## Adding data
Edit `data.js`: `JUMAAT_PRESETS` holds the "pick a place" starting points, and
`JUMAAT_SEED` holds hand-checked mosques that always show, merged with OpenStreetMap.

## Ideas for next steps
- Shared crowd reports ("hall full at 1:02pm") through the MyLokalEvent backend,
  so everyone sees them, not just you.
- Verified khutbah start times and capacity per mosque.
