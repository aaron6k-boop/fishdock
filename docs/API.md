# FishDock API contract

All routes live under `/api/*` (Cloudflare Pages Functions). `functions/api/<name>/[[path]].js` mounts
`server/<name>.js`, exactly as DetectDock does. Every response is JSON. Errors are
`{ "error": "<code>", "message": "<plain English>" }` with a matching HTTP status. Rate limits answer 429 with
`{ error: "rate_limited", kind: "daily" | "slow", resetAt?, retryAfter? }` and a `Retry-After` header.

Signed-in calls send `Authorization: Bearer <Firebase ID token>`. Guests can use every read-only data route.

## Live data (no account needed)

### `GET /api/conditions?lat=&lon=`
Weather and sea state for the next 3 days, hourly, Europe/London times as ISO strings with offset.
Source: Open-Meteo forecast + marine APIs (server-side, cached 30 min per 0.05° cell).
```json
{ "source": "open-meteo", "fetchedAt": "...", "cell": "50.60,-2.45",
  "hourly": [{ "t": "...", "tempC": 11.2, "windKph": 18, "gustKph": 31, "windDir": 225, "pressureHpa": 1012.4,
               "precipMm": 0.2, "cloudPct": 70, "isDay": 1 }],
  "marine": { "hourly": [{ "t": "...", "waveM": 0.8, "swellM": 0.6, "swellPeriodS": 9, "seaTempC": 13.1 }] } | null,
  "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)" }
```

### `GET /api/tides?lat=&lon=`
Tidal events for the nearest tide station. Order of sources:
1. Admiralty UK Tidal API (UKHO), when `ADMIRALTY_API_KEY` is set: nearest station within 40 km, 7 days of events.
2. Otherwise `{ "source": null }` and the app falls back to its on-device lunar estimate (clearly labelled).
```json
{ "source": "admiralty", "station": { "id": "0089", "name": "Dover", "lat": 51.11, "lon": 1.32, "distanceKm": 3.2 },
  "events": [{ "type": "HighWater", "t": "...", "heightM": 6.4 }], "attribution": "© Crown copyright ... UKHO" }
```

### `GET /api/river?lat=&lon=`
England only (Environment Agency real-time flood-monitoring API, Open Government Licence).
Nearest level station within 15 km, its last 48 readings, the station's typical range, and active flood
alerts and warnings within 20 km. Elsewhere: `{ "source": null, "note": "..." }`.
```json
{ "source": "environment-agency", "station": { "id": "...", "name": "...", "river": "River Wye", "distanceKm": 2.1,
  "typicalLow": 0.3, "typicalHigh": 1.9 }, "readings": [{ "t": "...", "levelM": 0.82 }],
  "trend": "rising" | "falling" | "steady", "state": "low" | "normal" | "high",
  "floods": [{ "severity": "Flood alert", "level": 3, "area": "...", "message": "..." }] }
```

### `GET /api/water?lat=&lon=`

What kind of water is at a point someone tapped on the map, from OpenStreetMap through the Overpass API
(`server/water.js`). The app uses it to pre-fill the water type in the tap-to-check sheet, and people can always
change it.

```json
{ "kind": "sea"|"river"|"lake"|"canal"|"fishery"|null, "subtype": "beach"|"pier"|"rocks"|"estuary"|"river"|"lake"|"reservoir"|"canal"|"fishery"|null,
  "name": "River Yare"|null, "sure": "high"|"medium"|"low", "source": "openstreetmap", "attribution": "Water features © OpenStreetMap contributors (ODbL)" }
```

The point goes to Overpass at 4 decimal places (about 10 m), with nothing about who asked. Nothing is cached or
logged, because a tapped point can be someone's private mark. If Overpass fails, the route returns 502 with a
plain message, and the app asks for the water type.

## AI (Beta, daily allowance per account and globally; guests get a small per-network allowance)

### `POST /api/ai/cast`
Body: `{ image: "<base64 JPEG, ≤ 1.6 MB>", context: { waterType: "sea"|"river"|"lake"|"canal",
spotName?, species?, tide?: "flooding"|"ebbing"|"high"|"low", timeOfDay?, verified?: [string] } }`.
Gemini vision. The model only describes what is visible. Response:
```json
{ "summary": "...", "scene": "beach"|"rocks"|"river"|"lake"|"harbour"|"other",
  "features": [{ "n": 1, "x": 0.42, "y": 0.55, "kind": "seam"|"eddy"|"gully"|"rocks"|"weed"|"colour-change"|"surf"|"overhang"|"slack"|"drop-off"|"structure",
                 "label": "...", "why": "...", "confidence": "low"|"medium"|"high" }],
  "avoid": [{ "x": 0.1, "y": 0.8, "label": "...", "why": "..." }],
  "safety": ["..."], "model": "gemini-..." }
```
`x`,`y` are fractions of the image width and height.

### `POST /api/ai/identify`
Body: `{ image, context?: { waterType?, region? } }` →
`{ "candidates": [{ "species": "Bass", "id": "bass", "confidence": "high", "why": "..." }], "lookalikes": ["..."], "note": "..." }`.
`id` matches `src/data/species.js` ids when the model's answer maps to one.

## Accounts and private data (Firebase ID token required)

### `GET/PUT /api/sync`
Private backup of the device's catches, sessions, marks and settings. Records are opaque JSON per
`{ kind, id, updatedAt, deleted? }`. Never shared; coordinates are only ever stored here and on the phone.
`GET /api/sync?since=<ms>` returns changed records; `PUT` with `{ records: [...] }` upserts (last writer wins).
`DELETE /api/sync` erases every record for the account (part of "Delete my data").

### `GET /api/sync/export`
Everything stored for the account as one JSON document.

## Community (Beta)

- `GET /api/community/feed?cursor=&species=` public catch reports and discussions, newest first.
- `POST /api/community/posts` `{ kind: "catch"|"report"|"question", text, species?, area?, photo? }`.
  `area` is a coarse place label or a 10 km grid square chosen by the poster; exact coordinates are rejected.
- `POST /api/community/posts/:id/report`, `POST /api/community/block/:uid`, `POST /api/community/follow/:uid`.
- Moderation (admins): `GET /api/admin/reports`, `POST /api/admin/posts/:id/hide`, `POST /api/admin/users/:uid/ban`.

## Live Fishing View sharing (no account; see docs/LIVE-VIEW.md)

Angler (owner key from creation, sent as `X-FishDock-Owner`): `POST /api/live/shares`, `POST /api/live/shares/:id/push`,
`GET|DELETE /api/live/shares/:id`, `PUT /api/live/shares/:id/scene`, `PUT /api/live/shares/:id/photos/:pid`,
`POST /api/live/shares/:id/links`, `PUT|DELETE /api/live/shares/:id/links/:lid`.
Viewer (link token as `X-FishDock-Link`, passcode grant as `X-FishDock-Grant`): `GET /api/live/view?after=<seq>`,
`POST /api/live/unlock`, `GET /api/live/scene`, `GET /api/live/photo/:pid`. A link that has ended, been revoked or
never existed is always the same 404 (`link_ended`). The `liveShare` admin flag switches sharing off.

### `GET /api/scene?lat=&lon=`
Free-licensed Wikimedia Commons photos taken within 4 km (10 km if few) of a 1 km square, landscape views of water
first, each with author, licence and file page. Kept for a week per square.

## Feedback and metrics

- `POST /api/feedback` `{ kind: "bug"|"idea"|"inaccurate-spot"|"inaccurate-forecast"|"other", text, ref? }` (guests allowed, rate-limited).
- `POST /api/metrics` `{ events: [{ name, value? }] }` privacy-preserving counters only (no ids, no coordinates):
  names such as `species_view:bass`, `advisor_run:bass`, `session_start`, `catch_logged`, `ai_cast`, `ai_identify`,
  `area_view:<region>` (region names only).

## Admin (ADMIN_EMAILS / ADMIN_UIDS)

`GET /api/admin/overview` users, daily/monthly active (hashed ids), guests (hashed network day keys), sessions,
catches, top species searched, top regions, AI usage, data-source health (last success/failure per upstream),
feedback counts. `GET /api/admin/feedback`, `GET/PUT /api/admin/flags` (feature flags such as
`castAdvisor`, `smartBite`, `community` on/off).
