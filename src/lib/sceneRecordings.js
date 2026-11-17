// ---- sceneRecordings: real recordings under the sound made on the phone (sceneAudio.js) ----
// The sea against a harbour, a fishing port with its gulls, wind, rain on concrete and in puddles, a fishing reel turned
// slowly, steadily and fast, and stones dropped in water for the splashes: recordings from BigSoundBank (Joseph Sardin
// and Denis Chardonnet, CC0 1.0: free for any use, no credit required; credited in public/models/CREDITS.txt and
// source-assets/ASSET-LICENCES.json), cut to seamless loops and loudness-matched by source-assets/prepare_sounds.py.
// Fetched once sound has started (after your first tap, sceneAudio.js), about 5 MB; until they arrive, or if they
// can't, the drawn sound plays alone.
// The beds loop with a short overlap (two voices, each faded in over the other's last second and a half), so a decoder's
// padding at either end of a file never leaves a gap or a click.

export const RECORDINGS = ["sea_waves", "sea_lap", "harbour", "rain_light", "rain_heavy", "wind", "wind_whistle", "reel_slow", "reel_medium", "reel_fast", "splash_small_1", "splash_small_2", "splash_big"];
export const SOUND_BASE = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/sounds/";
const XF = 1.5; // seconds two voices of a bed overlap where it comes round

/** Fetches and decodes every recording (each on its own: one that fails is left out). Resolves to a Map name → AudioBuffer. */
export async function loadRecordings(ac, base = SOUND_BASE, names = RECORDINGS) {
  const out = new Map();
  await Promise.all(names.map(async (n) => {
    try {
      const r = await fetch(base + n + ".mp3"); if (!r.ok) return;
      const data = await r.arrayBuffer();
      const buf = await new Promise((res, rej) => { const p = ac.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); });
      if (buf && buf.duration > 0.05) out.set(n, buf);
    } catch { /* left out: the drawn sound covers it */ }
  }));
  return out;
}

/** When the next voice of a bed of `dur` seconds, started `elapsed` seconds in, has to start (seconds from now), for the overlap. */
export const nextVoiceIn = (dur, elapsed, xf = XF) => Math.max(0, dur - elapsed - xf);

/** A looping bed of a recording into `out`: gain (its level), swell (its drift), stop(). Starts at a random point. */
export function recordedBed(ac, buffer, out, rnd = Math.random) {
  const gain = ac.createGain(); gain.gain.value = 0;
  const swell = ac.createGain(); swell.gain.value = 1;
  swell.connect(gain); gain.connect(out);
  let timer = null, stopped = false;
  const voice = (when, offset) => {
    const s = ac.createBufferSource(); s.buffer = buffer;
    const v = ac.createGain(); s.connect(v); v.connect(swell);
    const len = buffer.duration - offset;
    // (in over the first XF seconds, out over the last XF)
    v.gain.setValueAtTime(0.0001, when); v.gain.linearRampToValueAtTime(1, when + XF);
    v.gain.setValueAtTime(1, when + Math.max(XF, len - XF)); v.gain.linearRampToValueAtTime(0.0001, when + len);
    s.start(when, offset); s.stop(when + len + 0.05);
    return when + len - XF; // when the next voice begins
  };
  const chain = (startAt) => {
    if (stopped) return;
    const lead = 2; // (each next voice is put in two seconds ahead, by a timer, so a slow tab never misses it)
    const wait = Math.max(0, (startAt - ac.currentTime - lead) * 1000);
    timer = setTimeout(() => { if (stopped) return; const next = voice(Math.max(ac.currentTime + 0.05, startAt), 0); chain(next); }, wait);
  };
  chain(voice(ac.currentTime + 0.05, rnd() * Math.max(0, buffer.duration - XF * 3)));
  return { gain, swell, stop() { stopped = true; clearTimeout(timer); try { gain.disconnect(); } catch { /* gone */ } } };
}

/** A short piece of a recording (a reel's half turn, a splash): from `offset` for `dur` seconds (the whole of it if
 * none), at `rate`, faded in and out over a few milliseconds so it never clicks. */
export function grain(ac, buffer, out, { at = 0, offset = 0, dur = null, gain = 1, rate = 1, fade = 0.006 } = {}) {
  const t = ac.currentTime + at, len = Math.min(dur ?? buffer.duration, (buffer.duration - offset) / rate);
  const s = ac.createBufferSource(); s.buffer = buffer; s.playbackRate.value = rate;
  const v = ac.createGain(); v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(gain, t + fade);
  v.gain.setValueAtTime(gain, t + Math.max(fade, len - fade * 2)); v.gain.linearRampToValueAtTime(0.0001, t + len);
  s.connect(v); v.connect(out); s.start(t, offset); s.stop(t + len + 0.02);
}

/** The levels of the recorded beds for the drawn sound's plan (sceneAudio.js ambiencePlan) and the conditions: each
 * recording loudness-matched to its drawn bed (the -20 dB recordings against the drawn beds' measured levels), the sea
 * from a lapping calm to a breaking sea as the wind gets up, the harbour (gulls and the port) at a pier or an estuary,
 * quieter after dark, and the rain from drops on concrete to a downpour. */
export function recordedLevels(plan, c = {}) {
  const w = Math.max(0, Math.min(1, Number(c.wind) || 0)), r = Math.max(0, Math.min(1, Number(c.rain) || 0)), night = (Number(c.night) || 0) >= 0.5;
  const s = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sea = (c.kind || "sea") === "sea", harbour = c.venue === "pier" || c.venue === "estuary";
  const wash = plan.wash * 1.85;
  return {
    sea_lap: wash * (sea ? 1 - s(0.15, 0.5, w) * 0.7 : 1),
    sea_waves: sea ? wash * (0.25 + s(0.1, 0.45, w) * 0.85) : 0,
    harbour: harbour ? wash * 0.5 * (night ? 0.35 : 1) * (1 - 0.5 * r) : 0,
    wind: plan.wind * 1.1,
    wind_whistle: plan.whistle * 3,
    rain_light: r > 0 ? plan.rain * 2.5 * (1 - s(0.35, 0.8, r) * 0.6) : 0,
    rain_heavy: r > 0 ? plan.rain * 2.5 * s(0.25, 0.75, r) : 0,
  };
}
