// ---- fish photos: every species has one, every one is free to use and credited, and every URL is one Wikimedia serves ----
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PHOTOS, PHOTO_WIDTHS, photoFor, photoUrl, photoSrcSet, filePage, licenceUrl } from "../src/data/photos.js";
import { SPECIES } from "../src/data/species.js";

// The same rule the server uses for /api/fishinfo: the whole licence name must be a free one.
const FREE = /^(cc0( 1\.0)?|cc[- ]zero|public domain|pd(-[a-z0-9-]+)?|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?)$/i;

test("photos: every species has a credited photo with a free licence", () => {
  for (const sp of SPECIES) {
    const p = photoFor(sp.id);
    assert.ok(p, `${sp.id} has no photo`);
    assert.match(p.licence, FREE, `${sp.id}: ${p.licence}`);
    assert.ok(p.author && p.author.length < 80 && !/machine-readable|User:|\(c\)/i.test(p.author), `${sp.id}: tidy author "${p.author}"`);
    assert.ok(p.w > 0 && p.h > 0);
  }
  assert.equal(Object.keys(PHOTOS).filter((id) => !SPECIES.some((s) => s.id === id)).length, 0, "no photo for a species FishDock doesn't have");
});

test("photos: the folder on upload.wikimedia.org is the MD5 of the file name", () => {
  for (const [id, p] of Object.entries(PHOTOS)) {
    const h = createHash("md5").update(p.file).digest("hex");
    assert.equal(p.path, `${h[0]}/${h.slice(0, 2)}`, id);
    assert.doesNotMatch(p.file, /[?#/ ]/, `${id}: a bare file name with underscores`);
  }
});

test("photos: only Wikimedia's standard thumbnail widths, and the original when it's no bigger", () => {
  const cod = PHOTOS.cod, eel = PHOTOS.eel;
  assert.equal(photoUrl(cod, 330), "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Atlantic_Cod,_Atlantischer_Kabeljau_(Gadus_morhua).jpg/330px-Atlantic_Cod,_Atlantischer_Kabeljau_(Gadus_morhua).jpg");
  assert.equal(photoUrl(eel, 960), "https://upload.wikimedia.org/wikipedia/commons/5/58/Anguilla_anguilla.jpg", "the eel photo is only 400 px wide");
  assert.equal(photoUrl(cod, 640), "https://upload.wikimedia.org/wikipedia/commons/7/77/Atlantic_Cod,_Atlantischer_Kabeljau_(Gadus_morhua).jpg", "a non-standard width is never asked for");
  assert.equal(photoSrcSet(eel, [330, 500, 960]), "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Anguilla_anguilla.jpg/330px-Anguilla_anguilla.jpg 330w, https://upload.wikimedia.org/wikipedia/commons/5/58/Anguilla_anguilla.jpg 400w");
  for (const p of Object.values(PHOTOS)) for (const w of PHOTO_WIDTHS) {
    const u = photoUrl(p, w);
    const m = u.match(/\/(\d+)px-/);
    if (m) assert.ok(PHOTO_WIDTHS.includes(+m[1]) && +m[1] < p.w);
    assert.ok(u.startsWith("https://upload.wikimedia.org/wikipedia/commons/"));
  }
  // accented names are encoded; brackets and commas stay as Wikimedia writes them
  assert.match(photoUrl(PHOTOS["black-bream"], 330), /Arr%C3%A1bida/);
});

test("photos: credits link to the file page and the licence", () => {
  assert.equal(filePage(PHOTOS.zander), "https://commons.wikimedia.org/wiki/File:Hal_-_Sander_lucioperca_-_1.jpg");
  assert.equal(licenceUrl(PHOTOS.zander), "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.equal(licenceUrl(PHOTOS.bass), "https://creativecommons.org/licenses/by/2.0/");
  assert.equal(licenceUrl(PHOTOS["wels-catfish"]), "https://creativecommons.org/licenses/by-sa/3.0/de/");
  assert.equal(licenceUrl(PHOTOS.tope), null, "public domain: the file page explains it");
  for (const p of Object.values(PHOTOS)) if (/^CC BY/.test(p.licence)) assert.ok(licenceUrl(p), p.file);
});
