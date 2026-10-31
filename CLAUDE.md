# FishDock: notes for Claude sessions

FishDock is DetectDock's sibling: the same stack, conventions and privacy rules, for anglers. Aaron owns it.

Quick rules (as DetectDock):
- **Nothing deploys without Aaron's approval.** When the repository is connected to Cloudflare Pages, merging to `main` will deploy to production. Work on a branch and open a PR.
- Stack: React 19 + Vite PWA (`src/`), Cloudflare Pages Functions (`functions/api/<name>/[[path]].js` mounts `server/<name>.js`), one D1 database bound as `DB`, schema created and migrated by the server code (additive only: never drop or rename).
- `node --test tests/*.test.js` runs with no install (Node 22.13+). Run it before pushing. `node tools/build-preview.mjs` builds the single-file phone preview with esbuild (no install needed).
- Keys stay server-side (`GEMINI_API_KEY`, `ADMIRALTY_API_KEY` and so on). The phone only ever calls `/api/*` with the `X-FishDock: 1` header.
- Never fabricate live data. When a source isn't connected, the screen says so; estimates are labelled as estimates, AI output as unverified, experimental features as Beta.
- Reference data in `src/data/` follows `docs/DATA-SCHEMA.md`: every record has sources and a verification level. Never invent hook sizes, legal rules, prices or dates.
- Private by default: positions stay on the phone; anything public shows a region or a 10 km area at most.
- Words: UK English, plain wording, no em dashes in anything users see. Two-space indent, LF, `// ---- name ----` section comments. No new npm dependencies without Aaron's agreement.
- Separate from DetectDock: its own Firebase project, its own D1 database, its own Pages project. Never point FishDock at DetectDock's data.
