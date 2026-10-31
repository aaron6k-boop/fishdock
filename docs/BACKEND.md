# FishDock back end

Cloudflare Pages Functions, the same way DetectDock does it: `functions/api/<name>/[[path]].js` mounts `server/<name>.js`.
There's also a one-line `index.js` beside each one for the bare route (`/api/conditions`, `/api/sync`, ...). The
contract the app is written against is `docs/API.md`; this file covers what the server does, what it needs and
where its data comes from. Nothing here uses an npm package. `node --test tests/*.test.js` runs with no install
on Node 22.13 or newer, which has `node:sqlite` for the D1 stand-in.

## Conventions on every route

- **Same origin only, no CORS.** Every `/api` request must carry `X-FishDock: 1`, and every write must also carry an
  `Origin` header for this site. Otherwise the answer is 403 (`/api/admin` gives a plain 404 instead, so the
  panel isn't revealed). This copies DetectDock's `X-DetectDock` rule.
- **JSON everywhere.** Responses are sent with `cache-control: no-store`, `nosniff` and `no-referrer`. Errors look
  like `{ error: "<code>", message: "<plain English>" }` with a matching status.
- **Limits.** Daily allowances reset at UK midnight (Europe/London). Short throttles only catch floods. Either kind
  answers 429 `{ error: "rate_limited", kind: "daily", resetAt }` or `{ kind: "slow", retryAfter }`, with a
  `Retry-After` header. AI 429s also carry `scope` (`account`, `guest` or `everyone`) and `quota`.
- **Body size caps** (`server/body.js`, from DetectDock). A declared length over the cap is refused before anything
  is read, and a streamed body stops as soon as it passes the cap. The general cap is 64 KB; AI allows 2.3 MB
  (a photo of at most 1.6 MB as base64), Community 1 MB, sync 3 MB.
- **Network addresses are never stored.** Wherever a guest has to be told apart, the address becomes a keyed HMAC
  (`server/ipKey.js`, from DetectDock). The key is `IP_HASH_SECRET` if it's set; otherwise a random key is made
  each day and deleted after two days.
- **Signed-in calls** send `Authorization: Bearer <Firebase ID token>`. The token is verified on the server against
  Google's public keys (`server/firebaseAuth.js`, from DetectDock) for project `FIREBASE_PROJECT_ID` (default
  `fishdock`). Only Google, Apple and email-and-password accounts count. Email-and-password accounts must have a
  confirmed address before they can back up, post or use the account AI allowance; until then they get the
  guest allowance.
- **Outside calls** (`server/upstream.js`). Every call has a timeout: 8 s for data sources, 30 s for the Gemini
  vision answer, which takes longer. Each call records its outcome in `source_health`: when it last worked, when it
  last failed, and a short code (`timeout`, `network`, `http_503`, `bad_json`, `bad_output`). The upstream's body,
  URL and keys are never stored or sent to the app. The app only ever gets plain-English 502s or `{ source: null }`.
- **Text people see** has em and en dashes replaced (AI output included), and control and bidi characters removed.

## Endpoints

| Route | Auth | Needs `DB` | Notes |
| --- | --- | --- | --- |
| `GET /api/conditions?lat=&lon=` | none | no (no caching without it) | Open-Meteo forecast and marine data. The point is snapped to a 0.05° cell (about 5 km) and only the cell centre goes upstream. Cached 30 min per cell in D1 and the Cache API. `marine` is null inland or when the marine API fails. Within a day, an older copy is answered with `stale: true` when Open-Meteo is down. |
| `GET /api/tides?lat=&lon=` | none | no | Admiralty UK Tidal API when `ADMIRALTY_API_KEY` is set. Nearest station within 40 km, 7 days of events (`duration=7`). Otherwise, and when UKHO fails, `{ source: null, note }` so the app shows its labelled lunar estimate. See the caching note under Data sources. |
| `GET /api/river?lat=&lon=` | none | no | Environment Agency, England only (approximate borders, the same as `src/lib/geo.js`). Nearest river level station within 15 km, its last 48 readings, the typical range, `trend` and `state`, and flood alerts and warnings in force within 20 km. Elsewhere `{ source: null, note }`, naming SEPA, NRW and DfI Rivers. |
| `POST /api/ai/cast` | optional | yes | Gemini vision. Body `{ image, context }`. Answer as in `API.md`, plus `how` on each feature, `potential: true`, `note` and `quota`. |
| `POST /api/ai/identify` | optional | yes | Body `{ image, context?: { waterType, region, speciesIds? } }`. `id` is mapped onto the species ids (the server keeps a copy of the list, see TODO). Adds `unverified: true` and `quota`. |
| `GET /api/ai/status` | optional | yes | `{ configured, flags, quota }`. Never counts against the allowance. |
| `GET /api/sync?since=` | account | yes | Changed records after the cursor, 500 a page: `{ records, cursor, more, serverTime }`. |
| `PUT /api/sync` | account | yes | `{ records: [{ kind, id, updatedAt, deleted?, data }] }`, last writer wins. Each result is `saved`, `kept_newer`, `rejected`, `too_large`, `photo_not_allowed` or `over_quota`. |
| `DELETE /api/sync` | account | yes | Erases every record for the account. |
| `GET /api/sync/export` | account | yes | The account's records, Community posts, follows and blocks as one JSON document (sent as an attachment). |
| `GET /api/community/feed?kind=&species=&cursor=&tab=following` | optional | yes | `{ posts: [{ id, kind, text, species, area, photoUrl, createdAt, author: { uid, name } }], cursor }`, 20 a page, newest first. |
| `POST /api/community/posts` | account | yes | `{ kind, text, species?, area?, photo? }` (photo as base64 JPEG). 201 `{ post }`. |
| `DELETE /api/community/posts/:id` | author | yes | |
| `POST /api/community/posts/:id/report` | account | yes | `{ reason: spam, abuse, location, illegal, unsafe or other }`. |
| `POST`/`DELETE /api/community/block/:uid` | account | yes | Blocking hides posts both ways and ends following both ways. |
| `POST`/`DELETE /api/community/follow/:uid` | account | yes | |
| `GET`/`PUT /api/community/me` | account | yes | The name other anglers see (`{ name }`, 2 to 30 characters, no email address, no location). Without one, posts show "Angler". |
| `DELETE /api/community/me` | account (even banned or unverified) | yes | The Community half of "Delete my data": the account's posts are emptied (text, photo, area and species cleared, kept only as deleted rows), and its reports, follows, blocks and name are removed. A ban stays in place. |
| `GET /api/community/photo/:id` | none | yes | Only while the post is visible to the viewer. |
| `POST /api/feedback` | optional | yes | `{ kind, text, ref? }`. 3 a minute and 20 a UK day per network or account. Stores only kind, text, ref, the time, and whether it came from an account. |
| `POST /api/metrics` | none | yes | `{ events: [{ name, value? }] }`. Whitelisted names only, see below. |
| `GET /api/admin/me` | admin | yes | |
| `GET /api/admin/overview` | admin | yes | See below. |
| `GET /api/admin/feedback?cursor=&kind=` | admin | yes | `{ items: [{ id, kind, text, ref, createdAt, fromAccount }], cursor }` |
| `GET /api/admin/reports` | admin | yes | `{ items: [{ postId, text, reports, reasons, author, authorUid, authorBanned, hidden, kind, species, area, createdAt, lastReportAt }] }` |
| `POST /api/admin/posts/:id/hide` | admin | yes | `{ hidden?: boolean }`, default true. The post counts as reviewed: its reports are cleared, and later reports don't hide it automatically again. |
| `POST /api/admin/users/:uid/ban` | admin, signed in within the last 10 min | yes | `{ banned?: boolean }`, default true. A banned account can't post, report, follow, block or set a name, and its posts leave the feed. A banned admin loses the panel. |
| `GET`/`PUT /api/admin/flags` | admin | yes | `{ flags: { castAdvisor, identify, smartBite, community } }`. A PUT takes `{ flags }` and changes only those known names that are booleans. `castAdvisor`, `identify` and `community` switch their routes off (503 `feature_off`). `smartBite` is only read by the app. |

Without the `DB` binding, conditions, tides and river still answer (nothing is cached or throttled), every
other route answers 503 `not_configured`, and `/api/admin` answers 404.

### Admin overview

`{ day, users: { total, dau, mau, banned }, guests: { today }, sessions: { total, today, week }, catches: { total,
today, week }, ai: { castToday, identifyToday, usedToday, accountsToday, guestNetworksToday, globalLimit, configured },
feedback: { week, total }, community: { posts, hidden, reported }, topSpecies, topRegions, topAdvisor: [{ name, count }],
health: [{ upstream, lastOk, lastFail, lastError, okCount, failCount }], sources: { admiralty, gemini } }`

- `dau` and `mau` (the last 30 UK days) are counted from `active_days`. That table holds only a SHA-256 of the uid
  (with `IP_HASH_SECRET` mixed in) and the day's hashed network keys, never a uid or an address. Opening the admin
  panel doesn't count as activity.
- Guests are distinct hashed network keys seen today, on any route. Because the key changes daily, guests can't be
  counted over a month.
- Sessions and catches come from the `session_start` and `catch_logged` counters. The server never reads the
  private backup to count them.
- The top lists cover the last 30 days of `species_view:`, `area_view:` and `advisor_run:` counters.
- `health` names: `open-meteo`, `open-meteo-marine`, `admiralty`, `ea-flood`, `gemini`, `google-signing-keys`.

### Metrics whitelist

`session_start`, `catch_logged`, `ai_cast`, `ai_identify`, `species_view:<id>`, `advisor_run:<id>` (lowercase id such
as `bass` or `ballan-wrasse`) and `area_view:<region>`. A region is up to 30 letters (any alphabet), spaces and
`. , ' & ( ) -`, and can contain no digit, so a grid square or coordinates are refused. Anything else is dropped.
At most 50 events a request and 10 of any one name; `value` can add 1 to 10. Totals are kept per UK day only.

## AI allowances

Counted in `ai_usage` per UK day, with one atomic conditional update each. Cast and identify share the same
allowances.

- A signed-in account with a confirmed email: `AI_DAILY_USER_LIMIT` (default 30).
- Guests and unconfirmed accounts: 5 per network per day.
- Everyone together: `AI_DAILY_GLOBAL_LIMIT` (default 600).
- A burst guard of 6 a minute per caller answers `kind: "slow"`.

A request counts only when it reaches Gemini. One rejected before that (bad photo, too large, no key, feature off,
limit reached) never counts. A Gemini error, or an answer that isn't a JSON object, gives the allowance back and
answers 502 `ai_unavailable`. Photos are re-validated and stripped of EXIF and GPS (`server/jpeg.js`
`sanitizeJpeg`, from DetectDock: every APPn segment except plain JFIF, and every comment, is removed) before
they're sent. They're never stored or logged.

How the model's answer is checked (`buildCast` and `buildIdentify`, both tested):

- Only known `scene`, `kind` and `confidence` values are kept (an unknown kind becomes `structure`, an unknown
  confidence `low`).
- `x` and `y` are clamped to 0..1, and a feature without a numeric position is dropped.
- Every feature is marked `potential: true`.
- Any sentence stating a depth ("4 m deep") or claiming fish are present is removed.
- Em dashes become commas, and text lengths are capped.
- Context text that looks like a location is dropped before it reaches the prompt.

## Privacy rules in Community

- `area` may be a place or region name, a 10 km OS or Irish grid square (`SY68`, `SY 6 8`), or a latitude and
  longitude to one decimal place, as the app's own approximate label writes it (`50.6°, -2.4° (10 km area)`).
- In `area`, these are refused with `area_too_precise`: a number with two or more decimals, an OS grid reference
  with three or more figures, an Irish grid reference finer than 10 km, a postcode, a what3words address, or a map
  link.
- In post text and names, the same patterns are refused with `location_in_text` (`server/locationText.js`, ported
  from DetectDock).
- Photos are stripped of metadata before they're stored.
- Three different accounts' reports hide a post until an admin reviews it; the author still sees it, marked
  hidden.

## Database (`DB`)

The schema is created on a new worker's first request by `ensureSchema` in `server/db.js`, using additive
`CREATE TABLE IF NOT EXISTS` statements. Columns added later go in `MIGRATIONS` as `ALTER TABLE ... ADD COLUMN`,
never as a drop or a rename. Tables:

- `users`: uid, Community name, first and last seen, ban
- `sync_records`
- `posts`, `post_reports`, `blocks`, `follows`
- `feedback`
- `metrics_daily`: name, day, count
- `ai_usage`
- `source_health`: upstream, last_ok, last_fail, last_error, plus counts
- `flags`
- `cache`: key, value, expires
- `rate`: throttles and allowances
- `active_days`: hashed activity
- `admin_audit`
- `ip_hash_keys`, made by `ipKey.js` only when `IP_HASH_SECRET` isn't set

Housekeeping runs at most every 10 minutes per worker. It removes spent throttles, cache rows a day past expiry,
guest activity older than 35 days, account activity older than 400 days, and AI counters older than 35 days.

Sync caps: 100 records per push, 256 KB per record, 20,000 live records and 200 MB per account
(`SYNC_MAX_RECORDS` and `SYNC_MAX_BYTES` override the last two). Over the cap, new records stay on the phone as
`over_quota`; deletions always go through. Kinds accepted: `catch(es)`, `session(s)`, `mark(s)`, `settings`,
`setup(s)`, `spot(s)`. A top-level field holding an image data URL is left out, and the result says
`photosLeftOnPhone: true`. A record with an image data URL anywhere else is refused.

## Environment

Bindings and variables (Pages → Settings → Bindings / Variables and Secrets, for Production and, deliberately, for
Preview with its own database):

| Name | Kind | What it's for |
| --- | --- | --- |
| `DB` | D1 binding | Everything except conditions, tides and river. FishDock's own database, never DetectDock's. |
| `FIREBASE_PROJECT_ID` | variable (optional) | Firebase project whose ID tokens are accepted, and the `/__/auth` proxy target. Default `fishdock`. |
| `GEMINI_API_KEY` | secret | Cast Advisor and fish identification. Without it, AI answers 503 `not_configured`. |
| `GEMINI_MODEL` | variable (optional) | Overrides the model (default `gemini-3.8-flash`, as DetectDock). |
| `AI_DAILY_USER_LIMIT`, `AI_DAILY_GLOBAL_LIMIT` | variables (optional) | Defaults 30 and 600. Guests get 5 per network (in the code). |
| `ADMIRALTY_API_KEY` | secret (optional) | UK Tidal API subscription key. Without it, tides answer `{ source: null }`. |
| `ADMIRALTY_TIER` | variable (optional) | `discovery` (default), `foundation` or `premium`. Picks the base path and whether answers may be cached. |
| `ADMIN_EMAILS`, `ADMIN_UIDS` | variables | Who can open the admin panel. Emails need a verified Google or Apple sign-in; uids work with any provider. Comma-separated. |
| `IP_HASH_SECRET` | secret (recommended) | Key for hashing network addresses and account ids in activity counts. Without it, network keys use a daily random key. Account activity hashes are then unkeyed, which is still not reversible without the uid list but weaker. |
| `SYNC_MAX_RECORDS`, `SYNC_MAX_BYTES` | variables (optional) | Backup caps per account. |

`public/_routes.json` already limits Functions to `/api/*` and `/__/*`.

## Data sources and attribution

The app must show each attribution line wherever the data appears. The server sends it in `attribution`.

| Source | Used for | Licence and attribution |
| --- | --- | --- |
| Open-Meteo forecast API (`https://api.open-meteo.com/v1/forecast`) and marine API (`https://marine-api.open-meteo.com/v1/marine`) | `/api/conditions` | CC BY 4.0. "Weather data by Open-Meteo.com (CC BY 4.0)". Open-Meteo's free tier is for non-commercial use; a commercial FishDock needs an Open-Meteo API plan (`customer-api.open-meteo.com` with an `apikey` parameter). Not wired up yet. |
| UK Hydrographic Office, ADMIRALTY UK Tidal API (`https://admiraltyapi.azure-api.net/uktidalapi/...`) | `/api/tides` | Subscription terms (UKHO). The UKHO developer portal asks for "Contains ADMIRALTY® tidal data:" and "© Crown Copyright and database right." on two lines where visible, plus a "Powered by Azure API Management" credit. The server sends the first two in `attribution`; the app should also show the credit. |
| Environment Agency real-time flood-monitoring API (`https://environment.data.gov.uk/flood-monitoring`) | `/api/river` | Open Government Licence v3.0. The EA asks for "this uses Environment Agency flood and river level data from the real-time data API (Beta)". |
| Google Gemini API (`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) | `/api/ai/*` | Google's API terms. Output is labelled as AI (Beta) and unverified in the app. |
| Google securetoken signing keys (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`) | ID token checks | |

## What was verified, and what wasn't

Nothing upstream could be called from where this was built: the sandbox's proxy refused direct connections to
all three data services. Partway through, fetching web pages was also stopped, so that I wouldn't keep triggering
approval prompts. What follows comes from the pages I read before then, and from search-result snippets.

**Environment Agency** (read from the API reference page,
https://environment.data.gov.uk/flood-monitoring/doc/reference):

- Verified:
  - `/id/stations?lat=&long=&dist=` takes `dist` in km (it may be approximated by a bounding box) and filters
    with `parameter=level`.
  - Station fields used: `@id`, `notation`, `label`, `riverName`, `lat`, `long`, `status`, `measures` (each with
    `@id`, `parameter`, `qualifier`), and `stageScale` with `typicalRangeLow` and `typicalRangeHigh`. The single
    station record is `/id/stations/{id}`.
  - Readings: `/id/measures/{id}/readings?_sorted&_limit=`, with fields `dateTime`, `value` and `measure`.
    `value` is left out when the reading is NaN.
  - Floods: `/id/floods?lat=&long=&dist=` (km), with `description`, `eaAreaName`, `severity`, `severityLevel`
    (1 severe flood warning, 2 flood warning, 3 flood alert, 4 no longer in force) and `message`.
  - The OGL, and the attribution sentence above.
- Not verified:
  - Whether `stageScale` comes embedded in the list answer or only as a link (the code handles both, fetching the
    station record when it isn't embedded).
  - The exact `qualifier` strings ("Stage", "Downstream Stage", "Groundwater", "Tidal Level"). The code prefers
    `Stage`, skips groundwater, and otherwise takes the first non-tidal level measure.
  - Whether `items` on a single station is an object or a list (both are handled).

**Admiralty UK Tidal API (UKHO):**

- Verified from UKHO's portal pages:
  - The key goes in the `Ocp-Apim-Subscription-Key` header, and calls should be made from a server.
  - The attribution wording and the Azure credit.
  - A quota that's exceeded returns HTTP 403 until the period resets.
  - Discovery covers 607 UK stations, with events for today plus 6 days.
  - From the FAQ: times are GMT, with no BST applied; coordinates are GeoJSON order, longitude then latitude; the
    Channel Islands aren't included.
  - Also from the FAQ: "caching is not permitted if using the free of charge Discovery UK Tidal API
    subscription", and caching is permitted on Foundation and Premium. That's why `ADMIRALTY_TIER` defaults to
    `discovery` with no caching. **This contradicts the brief, which asked for a week's cache of stations and
    6 h of events. That caching applies only when `ADMIRALTY_TIER` is `foundation` or `premium`.** On Discovery,
    every tides request makes two UKHO calls: watch the subscription's quota, or move to Foundation.
- Taken from third-party clients, not from UKHO's own reference:
  - The base URL and paths. Discovery is `https://admiraltyapi.azure-api.net/uktidalapi/api/V1/Stations` and
    `/Stations/{id}/TidalEvents?duration=` (the R `uk.tides` and Python `ukhotides` clients). Foundation and
    Premium are `.../uktidalapi-foundation/api/V2/Stations` and `.../uktidalapi-premium/api/V2/Stations` (the
    `ukhotides` constants).
  - Field names: `features[].properties.Id` and `.Name`, and `EventType`, `DateTime` and `Height` on events (the
    `ukhotides` models). `IsApproximateTime` and `IsApproximateHeight` are assumed; if they're missing, nothing
    breaks.
  - The test samples in `tests/tides.test.js` were written to that shape, not recorded from the live API.
  - To do: replace the sample with a real recorded answer once a key exists, and check the V2 paths for
    Foundation.

**Open-Meteo:**

- Not fetched; written from the well-known public API:
  - The `forecast` and `marine` endpoints.
  - Hourly variables `temperature_2m`, `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m`, `pressure_msl`,
    `precipitation`, `cloud_cover`, `is_day`, `wave_height`, `swell_wave_height`, `swell_wave_period` and
    `sea_surface_temperature`.
  - The parameters `timezone=Europe/London`, `timeformat=unixtime` and `forecast_days=3`, with wind in km/h by
    default.
- The code accepts unixtime or ISO times. It treats a 400 from the marine API (an inland point) as "no sea
  data", not as a failure.

**Cloudflare Pages routing:**

- I couldn't confirm that `[[path]].js` also matches the bare route (`/api/sync` with nothing after it). The
  one-line `index.js` files cover that case either way.

**Gemini:**

- The request shape is copied from DetectDock's working `server/identify.js`: `x-goog-api-key` header,
  `inline_data`, `responseMimeType: application/json`.

## TODO

- `src/data/species.js` didn't exist when this was written. `server/ai.js` keeps its own `SPECIES` id list for
  mapping identify answers. Bring the two into line when the data file lands, or have the app send
  `context.speciesIds`, which the server already accepts.
- Record a real Admiralty answer for the test sample, and confirm the Foundation and Premium paths.
- An Open-Meteo commercial API key (`OPEN_METEO_API_KEY`), if FishDock is run commercially.
- "Delete my data" is two calls today, `DELETE /api/sync` and `DELETE /api/community/me`. Deleting the Firebase
  account itself, with a server-side marker so an old phone can't sync data back (DetectDock's
  `account_deletions`), isn't built yet.
- No retention sweep for `feedback` and `admin_audit` yet; decide how long to keep them.
- `tests/engines.test.js` (front end) fails until `src/data/species.js` exists. The back-end tests don't depend on
  it.
