// ---- voice: optional voice chat in a Fish Together party (WebRTC, phone to phone) ----
// Off until you tap Join voice, which asks for the microphone then and only then. Audio goes directly between the
// phones (FishDock's server only passes the connection set-up along); public STUN servers help phones find each
// other. On some mobile networks a direct connection isn't possible without a relay (TURN) server, which isn't set
// up yet: then that person can't be heard and text chat still works. Mute yourself, push to talk, turn anyone down
// or mute them; a speaking light shows who's talking.
// Proximity chat: each voice goes through the phone's audio engine with its own loudness and left/right position, set
// from how far away that angler stands in the 3D place and which side of you they are (setPlace). Turned off, everyone
// is heard at full volume.

// ---- proximity chat: how loud and from which side, from where two anglers stand (pure; tests) ----
// Full volume within 4 m (side by side at the rail), fading smoothly to silence at 30 m. `yaw` is which way you're
// looking (0 = -z): someone to your right is heard in your right ear.
export const PROXIMITY = { full: 4, silent: 30 };
export function proximityOf(me, them, yaw = 0) {
  if (!me || !them) return { near: 1, pan: 0 };
  const dx = them.x - me.x, dz = them.z - me.z, d = Math.hypot(dx, dz);
  const f = Math.max(0, Math.min(1, (d - PROXIMITY.full) / (PROXIMITY.silent - PROXIMITY.full)));
  const near = Math.round((1 - f * f * (3 - 2 * f)) * 100) / 100;
  const pan = d < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / d)) * 0.8;
  return { near, pan: Math.round(pan * 100) / 100 };
}

const ICE = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

export function createVoice({ me, send, onChange }) {
  let stream = null, ctx = null, on = false, muted = false, ptt = false, pttDown = false;
  const peers = new Map(); // id -> { pc, audio, polite, making, level, analyser, volume, muted }
  const state = () => ({ on, muted, ptt, proximity, talking: on && micLive(), peers: [...peers].map(([id, p]) => ({ id, connected: p.pc.connectionState === "connected", speaking: p.level > 0.06, near: p.near, volume: p.volume, muted: p.muted, failed: p.pc.connectionState === "failed" })), level: localLevel });
  const changed = () => onChange?.(state());
  const micLive = () => !muted && (!ptt || pttDown);
  const applyMic = () => { stream?.getAudioTracks().forEach((t) => { t.enabled = micLive(); }); send({ t: "voice", on, muted: !micLive() }); changed(); };
  let localLevel = 0, meter = 0;

  function analyse(src) {
    if (!ctx) return null;
    const a = ctx.createAnalyser(); a.fftSize = 512; src.connect(a);
    return a;
  }
  const buf = new Uint8Array(512);
  const levelOf = (a) => { if (!a) return 0; a.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; return Math.sqrt(s / buf.length); };

  function peer(id) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio(); audio.autoplay = true; audio.playsInline = true;
    const p = { pc, audio, polite: me < id, making: false, ignore: false, level: 0, analyser: null, volume: 1, muted: false, near: 1, pan: 0, gain: null, panner: null };
    peers.set(id, p);
    stream?.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0]; audio.play?.().catch(() => {});
      try {
        // heard through the audio engine (loudness by distance, left or right by direction); the audio element stays
        // attached but silent, which some browsers need before a call's sound flows at all
        const src = ctx.createMediaStreamSource(e.streams[0]);
        p.analyser = analyse(src);
        p.gain = ctx.createGain(); p.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        src.connect(p.gain);
        if (p.panner) { p.gain.connect(p.panner); p.panner.connect(ctx.destination); } else p.gain.connect(ctx.destination);
        audio.muted = true; output(p);
      } catch { p.gain = null; output(p); }
      changed();
    };
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: "signal", to: id, data: { ice: e.candidate.toJSON() } }); };
    pc.onnegotiationneeded = async () => { try { p.making = true; await pc.setLocalDescription(); send({ t: "signal", to: id, data: { sdp: pc.localDescription.toJSON() } }); } catch { /* retried on the next change */ } finally { p.making = false; } };
    pc.onconnectionstatechange = changed;
    return p;
  }
  // "perfect negotiation": either side may start; the polite one gives way on a clash
  async function signal(from, data) {
    if (!on) return;
    const p = peer(from), pc = p.pc;
    try {
      if (data.sdp) {
        const clash = data.sdp.type === "offer" && (p.making || pc.signalingState !== "stable");
        p.ignore = !p.polite && clash;
        if (p.ignore) return;
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === "offer") { await pc.setLocalDescription(); send({ t: "signal", to: from, data: { sdp: pc.localDescription.toJSON() } }); }
      } else if (data.ice) { try { await pc.addIceCandidate(data.ice); } catch (e) { if (!p.ignore) throw e; } }
    } catch { /* a bad message: ignore it */ }
  }
  let proximity = true;
  // what you actually hear from someone: your volume for them, muted or not, and (proximity chat) how near they are
  function output(p) {
    const g = p.muted ? 0 : Math.max(0, Math.min(1, p.volume * (proximity ? p.near : 1)));
    if (p.gain && ctx) { p.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.12); if (p.panner) p.panner.pan.setTargetAtTime(proximity ? p.pan : 0, ctx.currentTime, 0.12); }
    else { p.audio.muted = p.muted; p.audio.volume = g; }
  }
  function drop(id) { const p = peers.get(id); if (!p) return; try { p.pc.close(); } catch { /* ignore */ } p.audio.srcObject = null; peers.delete(id); changed(); }

  return {
    state,
    /** join: asks for the microphone now, then connects to everyone else in voice */
    async join(others) {
      if (on) return true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); localA = analyse(ctx.createMediaStreamSource(stream)); } catch { ctx = null; }
      on = true; applyMic();
      for (const id of others) peer(id); // offers go out through onnegotiationneeded
      meter = setInterval(() => { localLevel = levelOf(localA); for (const p of peers.values()) p.level = levelOf(p.analyser); changed(); }, 250);
      return true;
    },
    leave() { on = false; clearInterval(meter); for (const id of [...peers.keys()]) drop(id); stream?.getTracks().forEach((t) => t.stop()); stream = null; try { ctx?.close(); } catch { /* ignore */ } ctx = null; send({ t: "voice", on: false, muted: true }); changed(); },
    mute(v) { muted = !!v; applyMic(); },
    setPushToTalk(v) { ptt = !!v; pttDown = false; applyMic(); },
    talk(down) { pttDown = !!down; applyMic(); },
    setVolume(id, v) { const p = peers.get(id); if (p) { p.volume = v; output(p); changed(); } },
    muteOther(id, v) { const p = peers.get(id); if (p) { p.muted = !!v; output(p); changed(); } },
    /** Proximity chat: someone's nearness (0 silent .. 1 full) and side (-1 left .. 1 right), from the 3D place. */
    setPlace(id, near, pan) { const p = peers.get(id); if (p && (Math.abs(p.near - near) > 0.02 || Math.abs(p.pan - pan) > 0.05)) { p.near = near; p.pan = pan; output(p); } },
    setProximity(v) { proximity = !!v; for (const p of peers.values()) output(p); changed(); },
    signal, drop,
    /** someone new joined voice: connect to them */
    meet(id) { if (on && id !== me) peer(id); },
  };
}
let localA = null;
