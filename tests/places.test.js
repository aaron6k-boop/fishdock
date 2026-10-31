// GET /api/places: UK place search by name (Open-Meteo geocoding). Shapes follow its documented JSON.
import test from "node:test";
import assert from "node:assert/strict";
import { handlePlaces, shapePlaces, cleanQuery } from "../server/places.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

test("places: queries are cleaned and results shaped, UK only", () => {
  assert.equal(cleanQuery("  Gorleston <b>pier</b>; DROP "), "Gorleston b pier b DROP");
  const r = shapePlaces({ results: [
    { name: "Gorleston-on-Sea", latitude: 52.57641, longitude: 1.72912, feature_code: "PPL", country_code: "GB", admin1: "England", admin2: "Norfolk" },
    { name: "Gorleston", latitude: 40, longitude: -80, feature_code: "PPL", country_code: "US", admin1: "Ohio" },
    { name: "Chesil Beach", latitude: 50.62, longitude: -2.53, feature_code: "BCH", country_code: "GB", admin1: "England", admin2: "Dorset" },
  ] });
  assert.deepEqual(r, [
    { name: "Gorleston-on-Sea", area: "Norfolk, England", lat: 52.5764, lon: 1.7291, kind: "Town" },
    { name: "Chesil Beach", area: "Dorset, England", lat: 50.62, lon: -2.53, kind: "Beach" },
  ]);
  assert.deepEqual(shapePlaces(null), []);
});

test("places: GET sends only the words, caches, and short queries need no lookup", async (t) => {
  const s = setup();
  const net = stubFetch(t, [[/geocoding-api\.open-meteo\.com\/v1\/search\?name=Cromer&count=10&language=en&format=json&countryCode=GB/, () => ({ results: [{ name: "Cromer", latitude: 52.931, longitude: 1.301, feature_code: "PPL", country_code: "GB", admin1: "England", admin2: "Norfolk" }] })]]);
  const r = await s.call(handlePlaces, "/api/places")("GET", "?q=Cromer");
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].name, "Cromer");
  await s.call(handlePlaces, "/api/places")("GET", "?q=cromer");
  assert.equal(net.calls.length, 1, "same words, any case, come from the cache");
  assert.deepEqual((await s.call(handlePlaces, "/api/places")("GET", "?q=a")).body.results, []);
  assert.equal(net.calls.length, 1);
  assert.equal((await s.call(handlePlaces, "/api/places")("GET", "?q=Cromer", { fishdock: false })).status, 403);
});
