// (bundled by tools/export-scene.mjs and run inside the game's page: the scene as glTF, one file per part)
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
window.__fdExport = async function (names) {
  const W = window.__fdWorld, T = W.THREE, scene = W.scene;
  // what a game engine brings itself, or what belongs to the play rather than the place: left out
  const skip = (o) => o.isLight || o.isCamera || o.isPoints || o.isSprite || o.isLine || o.isSkinnedMesh || !o.visible ||
    /^(fdNoReflect|fp-hands|fdSea|fdSky)$/.test(o.name) || (o.material && (o.material.isShaderMaterial || o.material.isRawShaderMaterial)) ||
    (o.material && o.material.transparent && o.material.opacity < 0.05);
  const out = new T.Group(); const stats = { meshes: 0, instanced: 0, skipped: {}, tris: 0 };
  scene.updateMatrixWorld(true);
  scene.traverseVisible((o) => {
    if (!(o.isMesh)) return;
    let p = o, hidden = false; while (p) { if (p.name === "fdNoReflect" && p !== o && /angler|fp/.test(p.userData?.kind || "")) hidden = true; p = p.parent; }
    if (hidden || skip(o)) { const k = o.material?.type || o.type; stats.skipped[k] = (stats.skipped[k] || 0) + 1; return; }
    const g = o.geometry; if (!g?.attributes?.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // plain glTF materials: the colour, relief, roughness and metal maps; the game's own shader patches stay behind
    const conv = mats.map((m) => { const c = new T.MeshStandardMaterial({ name: m.name || o.userData.kind || o.name || "mat", color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, normalMap: m.normalMap || null, roughnessMap: m.roughnessMap || null, metalnessMap: m.metalnessMap || null, roughness: m.roughness ?? 1, metalness: m.metalness ?? 0, emissive: m.emissive ? m.emissive.clone() : 0x000000, emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, side: m.side, vertexColors: !!m.vertexColors }); if (m.normalScale) c.normalScale.copy(m.normalScale); return c; });
    const add = (matrix) => { const mesh = new T.Mesh(g, conv.length > 1 ? conv : conv[0]); mesh.name = (o.userData.kind || o.name || "part").replace(/\s+/g, "_") + "_" + stats.meshes; matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); out.add(mesh); stats.meshes++; stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; };
    if (o.isInstancedMesh) {
      // (instances written out as separate nodes sharing one mesh: glTF keeps the sharing, the engine can instance them again)
      const m4 = new T.Matrix4(), n = Math.min(o.count, 4000); stats.instanced += n;
      for (let i = 0; i < n; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); add(m4.clone()); }
    } else add(o.matrixWorld.clone());
  });
  const ex = new GLTFExporter();
  const buf = await ex.parseAsync(out, { binary: true, onlyVisible: false, maxTextureSize: 2048 });
  const u8 = new Uint8Array(buf); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), stats };
};
