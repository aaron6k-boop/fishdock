import test from "node:test";
import assert from "node:assert/strict";
import { bindSceneInput } from "../src/lib/world3d/sceneInput.js";
import { createLook } from "../src/lib/world3d/look.js";
import { handleState, stepHandle } from "../src/lib/reelHandle.js";
import { addRipple, stepRipples } from "../src/lib/world3d/waterFx.js";

class Surface extends EventTarget {
  clientHeight = 800;
  hidden = false;
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 800 }; }
  send(type, props = {}) { const e = new Event(type, { cancelable: true }); Object.assign(e, { pointerId: 1, clientX: 100, clientY: 100, button: 0 }, props); this.dispatchEvent(e); }
}
function rig() {
  const el = new Surface(), win = new Surface(), doc = new Surface();
  const events = [], w = { look: createLook(), walking: false, setWalkInput: i => events.push(i), walkTo: () => { events.push("walk"); return true; }, tapFish: () => false, jump: () => events.push("jump") };
  const stop = bindSceneInput(el, () => w, () => ({ onTap: () => events.push("tap") }), { win, doc });
  return { el, win, doc, w, events, stop };
}
const wait = () => new Promise(r => setTimeout(r, 360));
test("cancelled touch neither toggles the HUD nor leaves camera inertia", async () => {
  const r = rig(); r.el.send("pointerdown"); r.el.send("pointermove", { clientX: 102 }); r.el.send("pointercancel");
  const yaw = r.w.look.yaw; r.w.look.step(1); assert.equal(r.w.look.yaw, yaw);
  await wait(); assert.ok(!r.events.includes("tap")); assert.equal(r.w.look.dragging, false); r.stop();
});
test("pinching and lifting both fingers never toggles the HUD", async () => {
  const r = rig(); r.el.send("pointerdown"); r.el.send("pointerdown", { pointerId: 2, clientX: 200 });
  r.el.send("pointermove", { pointerId: 2, clientX: 240 }); assert.ok(r.w.look.fov < 62);
  r.el.send("pointerup", { pointerId: 2 }); r.el.send("pointerup"); await wait();
  assert.ok(!r.events.includes("tap")); r.stop();
});
test("normal capture release preserves a tap; disposal cancels a pending tap", async () => {
  const r = rig(); r.el.send("pointerdown"); r.el.send("pointerup"); r.el.send("lostpointercapture"); await wait();
  assert.equal(r.events.filter(e => e === "tap").length, 1);
  r.el.send("pointerdown"); r.el.send("pointerup"); r.stop(); await wait();
  assert.equal(r.events.filter(e => e === "tap").length, 1);
});
test("focus loss, hidden page and lost capture stop held movement", () => {
  for (const reason of ["window", "canvas", "hidden", "capture"]) {
    const r = rig(); r.w.walking = true; r.el.send("keydown", { key: "w" });
    assert.equal(r.events.at(-1).y, 1); r.el.send("pointerdown");
    if (reason === "window") r.win.send("blur");
    if (reason === "canvas") r.el.send("blur");
    if (reason === "hidden") { r.doc.hidden = true; r.doc.send("visibilitychange"); }
    if (reason === "capture") r.el.send("lostpointercapture");
    assert.deepEqual(r.events.at(-1), { x: 0, y: 0, sprint: false });
    r.el.send("keydown", { key: "d" }); assert.equal(r.events.at(-1).y, 0); r.stop();
  }
});
test("holding Space doesn't repeat jumps; right clicks don't grab the camera", () => {
  const r = rig(); r.w.walking = true;
  r.el.send("keydown", { key: " " }); r.el.send("keydown", { key: " ", repeat: true });
  assert.equal(r.events.filter(e => e === "jump").length, 1);
  r.el.send("pointerdown", { button: 2 }); assert.equal(r.w.look.dragging, false); r.stop();
});
test("releasing Shift before W does not leave uppercase W held", () => {
  const r = rig(); r.w.walking = true;
  r.el.send("keydown", { key: "Shift" }); r.el.send("keydown", { key: "W" });
  r.el.send("keyup", { key: "Shift" }); r.el.send("keyup", { key: "w" });
  assert.deepEqual(r.events.at(-1), { x: 0, y: 0, sprint: false }); r.stop();
});
test("camera flick travel is independent of frame rate", () => {
  const result = dt => {
    const l = createLook(); l.start(); l.drag(200, 0); l.end();
    const initial = l.state();
    for (let t = 0; t < 1 - 1e-9; t += dt) l.step(dt);
    return (l.yaw - initial.yaw) / initial.vyaw;
  };
  assert.ok(Math.abs(result(1 / 20) - result(1 / 120)) < 1e-9);
});
test("resetting a fight mid-turn never reverses the handle", () => {
  let s = stepHandle(handleState(), 0.5, 0.05); const at = s.angle; assert.ok(s.v > 0);
  for (let i = 0; i < 90; i++) { s = stepHandle(s, 0, 1 / 60); assert.equal(s.angle, at); }
  s = stepHandle(s, 0.5, 1 / 60); assert.ok(s.angle > at);
});
test("ripple output reuses rows and clears expired shader entries", () => {
  const list = [], out = []; addRipple(list, 1, 2, 0.7);
  assert.equal(stepRipples(list, 0.1, out), out); const row = out[0], strength = row[3];
  stepRipples(list, 0.1, out); assert.equal(out[0], row); assert.ok(row[3] < strength);
  stepRipples(list, 4, out); assert.equal(out.length, 0);
});
