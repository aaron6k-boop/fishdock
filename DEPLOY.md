# Deploying FishDock

FishDock copies DetectDock's set-up: a GitHub repository connected to its own Cloudflare Pages project, Pages
Functions for `/api/*`, and one D1 database. **Nothing here has been deployed yet: every step below needs Aaron.**

## One-off set-up (Aaron)

1. **GitHub:** create a private repository (suggested `aaron6k-boop/fishdock`) and push this code.
2. **Cloudflare Pages:** Workers & Pages → Create → Pages → connect the repository.
   - Build command `npm run build`, output directory `dist`, Node 22.
   - Production branch `main`. Every other branch gets a preview at `*.fishdock.pages.dev`.
3. **D1:** create a database named `fishdock` (never reuse DetectDock's) and bind it as `DB` for Production and,
   deliberately, a separate `fishdock-preview` database for Preview. The schema creates itself on first request.
4. **Firebase (accounts):** create a new Firebase project `fishdock` (separate from `detectdock`), enable Google
   sign-in, add the site's domain to Authorised domains, and paste the web config into `src/config.js`
   (`FIREBASE_CONFIG`). Until then FishDock runs guest-only and says so.
5. **Variables and secrets** (Pages → Settings → Variables and Secrets, for Production and Preview):

| Name | Kind | What it's for |
| --- | --- | --- |
| `DB` | D1 binding | Accounts' backups, Community, feedback, metrics, caches. Without it those routes answer 503. |
| `FIREBASE_PROJECT_ID` | variable | `fishdock`. Which Firebase project's ID tokens are accepted. |
| `GEMINI_API_KEY` | secret | Cast Advisor and fish identification (Beta). Without it those answer "not available". |
| `GEMINI_MODEL` | variable (optional) | Overrides the vision model. |
| `ADMIRALTY_API_KEY` | secret | Admiralty UK Tidal API (UKHO). Without it the app uses its labelled on-phone tide estimate. |
| `AI_DAILY_USER_LIMIT`, `AI_DAILY_GLOBAL_LIMIT` | variables (optional) | AI allowances (defaults 30 per account, 600 for everyone, per UK day). |
| `ADMIN_EMAILS`, `ADMIN_UIDS` | variables | Who can open the admin panel. |
| `IP_HASH_SECRET` | secret (optional) | Key for hashing network addresses in rate limits. |

6. **Domain:** add the chosen domain as a custom domain (e.g. `fishdock.co.uk`), as DetectDock's `detectdock.co.uk`.
7. **Map tiles:** the app uses OpenStreetMap's standard tiles and Esri imagery like DetectDock. OpenStreetMap's tile
   policy doesn't allow heavy app use, so before launch switch the base map to a keyed provider (MapTiler, as
   DetectDock uses for its historic maps) and add its host to `img-src` in `public/_headers` if it isn't `https:`.

## Data sources to sign up for

- **Admiralty UK Tidal API** (UKHO developer portal): the free Discovery tier covers UK tide stations and 7 days
  of events. Check its terms for commercial use before charging for anything.
- **Open-Meteo:** free for non-commercial use with attribution (CC BY 4.0); a paid plan is needed for commercial use.
- **Environment Agency flood-monitoring API:** free, no key, Open Government Licence (England only).
- **Gemini API key** (Google AI Studio), with a spending cap in Google's console.
- Wales (Natural Resources Wales), Scotland (SEPA) and Northern Ireland river levels are not connected yet.

## Before any merge

- `node --test tests/*.test.js` (no install needed) and `npm run build`.
- `node tools/build-preview.mjs` builds the single-file phone preview (`dist-preview/fishdock-preview.html`).
- Check the preview deployment on a real iPhone and Android phone (camera, GPS, microphone, Add to Home Screen).
