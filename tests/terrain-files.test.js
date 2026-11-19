// The environment system's surveyed ground kept in files (terrain3d.js): a place whose 5 m grid lives in a file stands on
// its usual level until the file is fetched, and on its survey once it is; the bytes decode as the inline grids do.
import test from "node:test";
import assert from "node:assert/strict";
import { TERRAIN, terrainHill, setTerrainBytes, loadTerrain } from "../src/lib/world3d/terrain3d.js";

// ---- a small grid coded as terrain_from_dtm.py codes it: rows of centimetres, changes as zigzag varints ----
function code(rows) {
  const out = [];
  for (const row of rows) { let prev = 0; for (const v of row) { const d = v - prev; prev = v; let z = d >= 0 ? 2 * d : -2 * d - 1; for (;;) { const b = z & 127; z = Math.floor(z / 128); if (z) out.push(b | 128); else { out.push(b); break; } } } }
  return Uint8Array.from(out);
}

test("a grid in a file: flat until fetched, its heights after", async () => {
  const n = 5, rows = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => 300 + 250 * i)); // (3 m rising 2.5 m a step east)
  TERRAIN.__filetest = { step: 10, n, half: 20, floor: 3, enc: "dv16", file: "terrain___filetest_5m.bin" };
  assert.equal(terrainHill("__filetest"), null, "no grid before its file is fetched");
  await loadTerrain("__filetest", "http://127.0.0.1:9/"); // (nothing answers there: still no grid, no throw)
  assert.equal(terrainHill("__filetest"), null);
  setTerrainBytes("__filetest", code(rows));
  const f = terrainHill("__filetest");
  assert.ok(Math.abs(f(-20, 0) - 0) < 1e-6, "the floor and below left flat");
  assert.ok(Math.abs(f(0, 0) - 5) < 1e-6, "8 m survey height stands 5 m over a 3 m floor");
  assert.ok(Math.abs(f(10, 5) - 7.5) < 1e-6);
  delete TERRAIN.__filetest;
});

test("every place's grid is inline or a file, never both", () => {
  for (const [name, T] of Object.entries(TERRAIN)) {
    assert.ok(!!T.data !== !!T.file, `${name}: data or file`);
    assert.equal(T.enc || "dv16", T.enc || "dv16");
    if (T.file) assert.match(T.file, /^terrain_[a-z]+_5m\.bin$/);
  }
});
