// The invite QR code (src/lib/qr.js): Reed-Solomon error correction, and the code's fixed patterns. (Generated
// codes were also checked by decoding them with OpenCV while building it.)
import test from "node:test";
import assert from "node:assert/strict";
import { rsEcc, qrMatrix, qrSvg } from "../src/lib/qr.js";

test("error correction matches the standard's worked example (HELLO WORLD, version 1-M)", () => {
  assert.deepEqual(rsEcc([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test("an invite link makes a version 5 code with its three finder squares and timing lines; too long gives null", () => {
  const M = qrMatrix("https://fishdock.aaron6k.workers.dev/#party/ABC234/xY9_kLmn0pQrStUv");
  assert.equal(M.length, 37);
  for (const [r, c] of [[0, 0], [0, 30], [30, 0]]) { assert.equal(M[r][c], true); assert.equal(M[r + 1][c + 1], false); assert.equal(M[r + 3][c + 3], true); }
  for (let i = 8; i < 29; i++) { assert.equal(M[6][i], i % 2 === 0); assert.equal(M[i][6], i % 2 === 0); }
  assert.equal(qrMatrix("x".repeat(200)), null);
  assert.match(qrSvg("HELLO"), /^<svg/);
});
