(() => { const W = window.__fdWorld, S = window.__fdSock, P = window.__fdProbe, THREE_ = null;
  const c = S[1].sock, q = P.reelQ; const out = { sock: c, reelQ: q, knob: S[0].sock, meshes: [] };
  // socket frame: rotate (v - c) by inverse of q
  const inv = (x, y, z) => { x -= c[0]; y -= c[1]; z -= c[2]; const qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; };
  W.scene.updateMatrixWorld(true);
  W.scene.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = g.boundingSphere, e = o.matrixWorld.elements;
    const cx = e[0] * bs.center.x + e[4] * bs.center.y + e[8] * bs.center.z + e[12], cy = e[1] * bs.center.x + e[5] * bs.center.y + e[9] * bs.center.z + e[13], cz = e[2] * bs.center.x + e[6] * bs.center.y + e[10] * bs.center.z + e[14];
    const sc = Math.hypot(e[0], e[1], e[2]), d = Math.hypot(cx - c[0], cy - c[1], cz - c[2]);
    if (d - bs.radius * sc > 0.3 || bs.radius * sc > 8) return;
    const pos = g.attributes.position, idx = g.index, V = [], T = [], map = new Map();
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) { const tri = [];
      let near = false;
      for (let k = 0; k < 3; k++) { const i = idx ? idx.getX(t + k) : t + k; const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const w = inv(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]); tri.push([i, w]); if (Math.hypot(w[0], w[1], w[2]) < 0.3) near = true; }
      if (!near) continue;
      for (const [i, w] of tri) { if (!map.has(i)) { map.set(i, V.length / 3); V.push(+w[0].toFixed(5), +w[1].toFixed(5), +w[2].toFixed(5)); } T.push(map.get(i)); } }
    if (T.length) out.meshes.push({ name: o.name || o.parent?.name || "?", parent: o.parent?.name || "", mat: o.material?.name || "", v: V, t: T }); });
  return out; })()
