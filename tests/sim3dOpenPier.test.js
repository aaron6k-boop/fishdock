// The open pier's deck (openPier.js) faces up whichever way round its outline runs: the map draws some outlines one
// way and some the other (Cromer's pier anticlockwise in x, z, Whitby's extensions clockwise), and a deck wound by the
// outline's direction instead of each triangle's own came out facing down, drawn black, at Whitby (18 November 2026).
// Needs node_modules (three).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildOpenPier } from "../src/lib/world3d/openPier.js";

test("an open pier's deck faces up for an outline either way round, iron legs or a timber frame", () => {
  const rings = [[[0, 0], [40, 0], [40, 8], [0, 8]], [[0, 0], [0, 8], [40, 8], [40, 0]]];
  for (const style of [undefined, "trestle"]) for (const ring of rings) {
    const r = buildOpenPier(new THREE.Group(), ring, 4.8, { style, benches: style ? false : undefined, lamps: style ? false : undefined });
    const deck = r.meshes.find((m) => m.userData.kind === "the pier" && m.geometry.attributes.normal && m.geometry.attributes.uv);
    const n = deck.geometry.attributes.normal; let up = 0, down = 0;
    for (let i = 0; i < n.count; i++) { if (n.getY(i) > 0.5) up++; else if (n.getY(i) < -0.5) down++; }
    assert.ok(up > 0 && down === 0, `${style || "iron"} ${JSON.stringify(ring[1])}: up ${up}, down ${down}`);
  }
});
