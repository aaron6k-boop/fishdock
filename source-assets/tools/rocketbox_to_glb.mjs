// ---- rocketbox_to_glb: a Microsoft Rocketbox person (FBX and its TGA textures) as FishDock's people glTF ----
// The same form as the first twelve (public/people/<file>.glb, made with three.js's own FBX loader and glTF exporter):
// one skinned body on the Bip01 skeleton in a node called "avatar", materials <code>_body, <code>_head and
// <code>_opacity (the hair and lashes, alpha-tested, both sides), colour maps at 1024 px and normal maps at 512 px as
// JPEG, the opacity map at 512 px as PNG; and a 120 by 150 portrait (<file>.webp) for choosing them. No animation: the
// movements are shared (anims.glb, anims2.glb). A _hd.glb with 2048 px colour and 1024 px normal maps for the High and
// Ultra settings.
//   node source-assets/tools/rocketbox_to_glb.mjs ROCKETBOX_DIR OUT_DIR Adults/Male_Adult_02=m02 Adults/Female_Adult_08=f08 ...
// ROCKETBOX_DIR holds the library's own layout (Assets/Avatars/<group>/<name>/Export/<name>.fbx and Textures/).
// Runs three.js in headless Chromium (Playwright), as decoding the textures needs a browser's canvas.
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [RB, OUT, ...jobs] = process.argv.slice(2);
const NM = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../node_modules");
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".fbx": "application/octet-stream", ".tga": "application/octet-stream" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  const f = u === "/" ? null : u.startsWith("/nm/") ? path.join(NM, u.slice(4)) : u.startsWith("/rb/") ? path.join(RB, u.slice(4)) : u.startsWith("/ref/") ? path.join(NM, "../public/people", u.slice(5)) : null;
  if (u === "/") { r.writeHead(200, { "content-type": "text/html" }); r.end(`<!doctype html><script type="importmap">{"imports":{"three":"/nm/three/build/three.module.js","three/addons/":"/nm/three/examples/jsm/"}}</script><body></body>`); return; }
  if (!f || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); p.on("console", (m) => { if (m.type() === "error" || /^(WARN|INFO)/.test(m.text())) console.log("  page:", m.text()); }); p.on("pageerror", (e) => console.log("  page error:", e.message));
await p.goto(`http://localhost:${port}/`);
for (const job of jobs) {
  const [folder, file] = job.split("=");
  const name = folder.split("/").pop();
  const res = await p.evaluate(async ([folder, name]) => {
    const THREE = await import("three");
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    const { TGALoader } = await import("three/addons/loaders/TGALoader.js");
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { clone: cloneSkinned } = await import("three/addons/utils/SkeletonUtils.js");
    const { mergeVertices } = await import("three/addons/utils/BufferGeometryUtils.js");
    const base = `/rb/Assets/Avatars/${folder}/`;
    // (the FBX names its textures by the paths they had when it was made: only the models are wanted from it)
    const mgr = new THREE.LoadingManager(); mgr.setURLModifier((u) => (/\.(tga|png|jpe?g|dds)$/i.test(u) ? "data:," : u));
    const fbx = await new FBXLoader(mgr).loadAsync(base + `Export/${name}.fbx`);
    // (the FBX loader gives every triangle its own corners and the modeller's vertex colours: the colours dropped,
    // which nothing uses, and corners shared again, as in the first twelve: about 5,500 vertices, not 22,000)
    fbx.traverse((o) => { if (!o.isMesh) return; o.geometry.deleteAttribute("color"); const groups = o.geometry.groups.map((q) => ({ ...q })); const m = mergeVertices(o.geometry, 1e-4); if (!m.groups.length) for (const q of groups) m.addGroup(q.start, q.count, q.materialIndex); o.geometry = m; });
    // ---- the textures, as images the right way up, at the sizes wanted ----
    const tga = new TGALoader();
    const files = await (async () => { const out = {}; for (const kind of ["body_color", "body_normal", "head_color", "head_normal", "opacity_color"]) out[kind] = null; return out; })();
    const mats = []; fbx.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (!mats.includes(m)) mats.push(m); });
    const code = (mats.map((m) => /^([mf]\d{3})_/.exec(m.name)?.[1]).find(Boolean)) || null;
    const load = async (kind) => { try { const t = await tga.loadAsync(base + `Textures/${code}_${kind}.tga`); return t; } catch { return null; } };
    for (const k of Object.keys(files)) files[k] = await load(k);
    const toCanvas = (t, size) => {
      const { width: w, height: h, data } = t.image, c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"), id = g.createImageData(w, h); id.data.set(data); g.putImageData(id, 0, 0);
      // (TGALoader's data has its first row at the bottom when flipY is false: drawn the right way up)
      const o = document.createElement("canvas"); o.width = o.height = size; const og = o.getContext("2d"); og.imageSmoothingQuality = "high";
      if (!t.flipY) { og.translate(0, size); og.scale(1, -1); }
      og.drawImage(c, 0, 0, size, size); return o;
    };
    const build = (hd) => {
      const tex = (kind, size, jpeg) => { const t0 = files[kind]; if (!t0) return null; const t = new THREE.CanvasTexture(toCanvas(t0, size)); t.flipY = true; if (/color/.test(kind)) t.colorSpace = THREE.SRGBColorSpace; t.userData.mimeType = jpeg ? "image/jpeg" : "image/png"; return t; };
      const C = hd ? 2048 : 1024, N = hd ? 1024 : 512;
      const made = {
        body: new THREE.MeshStandardMaterial({ name: `${code}_body`, map: tex("body_color", C, true), normalMap: tex("body_normal", N, true), roughness: 0.85, metalness: 0 }),
        head: new THREE.MeshStandardMaterial({ name: `${code}_head`, map: tex("head_color", C, true), normalMap: tex("head_normal", N, true), roughness: 0.62, metalness: 0 }),
        opacity: files.opacity_color ? new THREE.MeshStandardMaterial({ name: `${code}_opacity`, map: tex("opacity_color", 512, false), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }) : null,
      };
      const clone = cloneSkinned(fbx); // (its own bones, the skins bound to them: only the materials change)
      const drop = [];
      clone.traverse((o) => { if (!o.isMesh) return; const pick = (m) => (/opacity/i.test(m.name) ? made.opacity : /head/i.test(m.name) ? made.head : made.body);
        o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material); if ([].concat(o.material).some((m) => !m)) drop.push(o); });
      for (const o of drop) o.parent.remove(o);
      clone.animations = []; clone.name = ""; clone.scale.setScalar(0.01); clone.userData.unitScaleFactor = 1; // (centimetres to metres, as the others)
      const avatar = new THREE.Group(); avatar.name = "avatar"; avatar.add(clone);
      return avatar;
    };
    const exp = async (obj) => new Uint8Array(await new GLTFExporter().parseAsync(obj, { binary: true, onlyVisible: true, animations: [] }));
    const lo = await exp(build(false)), hd = await exp(build(true));
    // ---- checks: loaded back, how tall it stands and which way it faces, against the people already in the game ----
    const gl = new GLTFLoader(), parse = (u8) => new Promise((ok, no) => gl.parse(u8.buffer, "", ok, no));
    const measure = (g) => { const s = g.scene; s.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(s, true); const toe = s.getObjectByName("Bip01_L_Toe0"), heel = s.getObjectByName("Bip01_L_Foot");
      const d = toe && heel ? toe.getWorldPosition(new THREE.Vector3()).sub(heel.getWorldPosition(new THREE.Vector3())) : null; let joints = 0; s.traverse((o) => { if (o.isSkinnedMesh) joints = Math.max(joints, o.skeleton.bones.length); });
      return { h: +(box.max.y - box.min.y).toFixed(3), minY: +box.min.y.toFixed(3), facing: d ? (Math.abs(d.z) > Math.abs(d.x) ? (d.z > 0 ? "+z" : "-z") : (d.x > 0 ? "+x" : "-x")) : "?", joints }; };
    const mine = measure(await parse(lo));
    const ref = measure(await parse(new Uint8Array(await (await fetch("/ref/m04.glb")).arrayBuffer())));
    // ---- the portrait: head and chest, the sky and the deck behind, as the others' ----
    const g = await parse(lo), s = g.scene;
    // (standing as they do in the game: the shared idle movement, a moment in)
    const moves = await parse(new Uint8Array(await (await fetch("/ref/anims.glb")).arrayBuffer()));
    const idle = moves.animations.find((c) => c.name === (/Female/.test(folder) ? "f_idle" : "m_idle"));
    if (idle) { const mx = new THREE.AnimationMixer(s); const act = mx.clipAction(idle.clone()); act.play(); mx.setTime(0.6); }
    s.updateMatrixWorld(true);
    const head = s.getObjectByName("Bip01_Head").getWorldPosition(new THREE.Vector3());
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(240, 300); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.add(s);
    const bg = document.createElement("canvas"); bg.width = 4; bg.height = 300; const bgc = bg.getContext("2d"); bgc.fillStyle = "rgb(159,195,224)"; bgc.fillRect(0, 0, 4, 128); bgc.fillStyle = "rgb(170,170,159)"; bgc.fillRect(0, 132, 4, 168); bgc.fillStyle = "rgb(172,180,190)"; bgc.fillRect(0, 128, 4, 4);
    const bt = new THREE.CanvasTexture(bg); bt.colorSpace = THREE.SRGBColorSpace; sc.background = bt;
    sc.add(new THREE.HemisphereLight(0xdfe9f3, 0x6b6453, 1.6)); const sun = new THREE.DirectionalLight(0xfff1df, 2.4); sun.position.set(1.5, 3, 4); sc.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 240 / 300, 0.05, 20); cam.position.set(head.x, head.y - 0.1, head.z + 1.25); cam.lookAt(head.x, head.y - 0.17, head.z);
    r.render(sc, cam); const webp = r.domElement.toDataURL("image/webp", 0.82);
    const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
    return { code, mine, have: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v ? `${v.image.width}x${v.image.height} flipY ${v.flipY}` : null])), lo: b64(lo), hd: b64(hd), webp, ref };
  }, [folder, name]);
  fs.writeFileSync(path.join(OUT, `${file}.glb`), Buffer.from(res.lo, "base64"));
  fs.writeFileSync(path.join(OUT, `${file}_hd.glb`), Buffer.from(res.hd, "base64"));
  fs.writeFileSync(path.join(OUT, `${file}_portrait240.webp`), Buffer.from(res.webp.split(",")[1], "base64"));
  console.log(file, name, res.code, "this", JSON.stringify(res.mine), "m04", JSON.stringify(res.ref), JSON.stringify(res.have), Math.round(Buffer.from(res.lo, "base64").length / 1024), "KB,", Math.round(Buffer.from(res.hd, "base64").length / 1024), "KB HD");
}
await b.close(); srv.close();
