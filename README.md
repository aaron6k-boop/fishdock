# FishDock

The UK fishing companion for sea, beach, rock, river, canal, lake and day-ticket anglers. A sibling of
[DetectDock](https://detectdock.co.uk): the same stack, design language and privacy-first principles.

Free, private by default, no adverts, guest-first.

## What it does

- **Home:** species-specific **BiteScore** for every half hour, with the factors and a confidence label;
  best days this week; live conditions, tides, river levels, sun and moon; **What Can I Catch Here?** with
  evidence levels; rules and safety for the place and date.
- **Explore:** documented marks on a map (with EMODnet depth shading and OpenSeaMap sea marks), a map-free
  sonar view, and the species guide.
- **Bait & Rigs:** the **Bait & Tackle Advisor** (bait, hook, rig diagram, presentation, where, when, distance,
  how to adapt, legal), the rig library with step-by-step tying, knots and baits.
- **Live Fishing Mode:** timer, bite, missed-bite, catch and cast counters, private marks, GPS track, hourly
  conditions snapshots, timeline, replay and session comparison. **Smart Bite (Beta):** rod-tip camera watch and
  bite-alarm listening.
- **Cast Advisor (Beta):** point the camera at the water; possible casting features are marked on the picture.
- **My Catches:** catch catalogue with photos, sizes, bait, hook, rig, depth, conditions, personal bests and
  what works for you. AI fish identification (Beta).
- **Community (Beta):** catch reports, fishing reports and questions; areas only, never exact marks.
- **Settings and privacy, Admin panel.**

## Develop

```
node --test tests/*.test.js          # unit and server tests, no install needed (Node 22.13+)
node tools/build-preview.mjs         # single-file phone preview in dist-preview/ (esbuild, no install)
npm install && npm run dev           # full Vite dev server
npm run build                        # production build (Cloudflare Pages)
```

See `CLAUDE.md` for conventions, `DEPLOY.md` for set-up, `docs/API.md` for the API, `docs/DATA-SCHEMA.md` for
the reference data, `docs/STATUS.md` for what works today.
