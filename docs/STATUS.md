# FishDock status (31 October 2026)

Working = runs today in the code, tested. Needs deployment = built and tested locally, but depends on the
server, keys or accounts that only exist once Aaron sets up Cloudflare Pages (see DEPLOY.md). Beta = works,
but not field-tested, labelled Beta in the app. Not built = not started.

## Stage 1: core experience

| Feature | Status | Notes |
| --- | --- | --- |
| Design system, navigation, onboarding | Working | DetectDock's tokens, radii, spacing, tab bar and guest-first welcome; sea-teal and ocean-blue accents; dark first, light and system themes |
| Fishing map | Working, needs deployment for tiles | Leaflet with OpenStreetMap / Esri, EMODnet depth shading, OpenSeaMap sea marks, private marks; the phone preview shows the sonar view instead |
| Species database | Working | See data verification levels in each record |
| Bait & Tackle Advisor | Working | Assembled only from the sourced database; gaps say "not sourced" |
| Rigs, knots, baits | Working | Rig diagrams drawn from each rig's parts; step-by-step tying |
| Catch diary | Working | On the phone (IndexedDB); export CSV/JSON; personal bests; what works for you |

## Stage 2: live intelligence

| Feature | Status | Notes |
| --- | --- | --- |
| BiteScore | Beta | Transparent weights, per species, confidence label, 7-day view |
| Tides | Working (estimate); official needs deployment + `ADMIRALTY_API_KEY` | On-phone estimate calibrated on published times for 43 ports (worst error 45 min on the calibration days), labelled "about an hour"; Discovery tier answers are not cached, per UKHO terms |
| Weather and sea state | Needs deployment | Open-Meteo via `/api/conditions` |
| River levels and flood warnings | Needs deployment (England only) | Environment Agency via `/api/river` |
| Location-based recommendations | Working | What Can I Catch Here? with evidence levels |

## Stage 3: advanced

| Feature | Status | Notes |
| --- | --- | --- |
| AI Cast Advisor | Beta, needs deployment + `GEMINI_API_KEY` | Works in the phone preview through Claude, with consent |
| AI fish identification | Beta, needs deployment + `GEMINI_API_KEY` | Same |
| Live Fishing Mode | Working | GPS needs the deployed site or app (blocked in the preview) |
| Smart Bite (camera rod tip, bite-alarm listen) | Beta, experimental | Needs camera/microphone: deployed site or app |
| Personal recommendations | Working | From the angler's own log |

## Stage 4: community and polish

| Feature | Status | Notes |
| --- | --- | --- |
| Community feed, posts, follow, report, block | Beta, needs deployment + Firebase project | Areas only; coordinates rejected server-side |
| Private backup (sync) | Needs deployment + Firebase project | |
| Admin panel | Needs deployment | ADMIN_EMAILS / ADMIN_UIDS |
| Feedback and "report inaccurate information" | Needs deployment | Guests allowed, rate-limited |
| Export and delete my data | Working | |
| Offline app shell | Working after deployment | Service worker; offline maps not built |

## Not built yet

Offline map downloads, live weather and tide push alerts, voice commands, nearby tackle shops and fisheries,
challenges and achievements, a personal-best leaderboard, Wales/Scotland/NI river levels, the native iPhone and
Android apps (needed for reliable background GPS, as DetectDock found).

## Data in the app

- 41 published fishing marks (24 fully sourced, 17 partly; 19 positions approximate and flagged).
- 38 species (17 with verified tackle data, 11 partial, 10 general guidance only; hook sizes missing for 15 and shown as "not sourced").
- 29 rigs (14 verified, 11 partial, 4 general), 11 knots, 20 baits, 6 beginner lessons.
- Rules checked 31 October 2026: rod licence prices (England and Wales), 2026 bass rules (SI 2026/105), close
  seasons, 18 district minimum sizes, Scotland and Northern Ireland notes.

## Tests (31 October 2026)

- `node --test tests/*.test.js`: 70 of 70 pass (55 server, 15 app engines), no network.
- `node tools/check-data.mjs`: all reference data consistent.
- `tools/smoke.mjs` against `tests/e2e/server.mjs` (real server code, stand-in outside services): every screen
  opens with no errors or sideways overflow at iPhone (390 px) and small Android (360 px), dark and light.
- Not tested: real phones (camera, GPS, microphone, Add to Home Screen), the live Admiralty, Open-Meteo, Environment
  Agency and Gemini services (unreachable from the build machine), Firebase sign-in (no project yet), Vite build
  (`npm install` unavailable here; the esbuild bundle of the same source builds cleanly).
