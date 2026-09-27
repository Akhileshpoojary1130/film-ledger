// Unit tests for the where-to-watch function's picking and tidying (no network).
import test from "node:test";
import assert from "node:assert/strict";
import { offersOf, pick } from "../api/where.js";

const offer = (type, name, price) => ({
  monetizationType: type, presentationType: "HD", standardWebURL: "https://example.com/" + encodeURIComponent(name),
  retailPrice: price || null, package: { clearName: name, technicalName: name.toLowerCase(), icon: "/icon/1/s100/x.{format}" },
});

test("offersOf keeps one row per service and kind, cheapest price, streaming first", () => {
  const list = offersOf({ offers: [
    offer("RENT", "Apple TV Store", "₹129.00"), offer("RENT", "Apple TV Store", "₹99.00"), offer("BUY", "Apple TV Store", "₹149.00"),
    offer("FLATRATE", "Netflix"), offer("FLATRATE", "Netflix"),
    offer("FLATRATE", "Amazon Prime Video"), offer("FLATRATE", "Amazon Prime Video with Ads"), offer("ADS", "Amazon Prime Video Free with Ads"),
    offer("ADS", "MX Player"), offer("ADS", "Amazon MX Player"), offer("CINEMA", "PVR"),
  ] });
  assert.deepEqual(list.map((o) => o.service + ":" + o.kind + (o.price ? " " + o.price : "")),
    ["Netflix:stream", "Amazon Prime Video:stream", "MX Player:ads", "Apple TV Store:rent ₹99.00", "Apple TV Store:buy ₹149.00"]);
  assert.equal(list[0].icon, "https://images.justwatch.com/icon/1/s100/x.webp");
});

test("pick prefers the IMDb id, else the same name and year", () => {
  const node = (title, year, imdb, type) => ({ node: { objectType: type || "MOVIE", content: { title, originalReleaseYear: year, externalIds: { imdbId: imdb } } } });
  const edges = [node("PK", 2014, "tt2338151"), node("Naadu", 2023, "tt28182832"), node("Mirzapur", 2018, "tt6473300", "SHOW")];
  assert.equal(pick(edges, { title: "P.K.", imdb: "tt2338151" }).content.title, "PK");
  assert.equal(pick(edges, { title: "Mirzapur", type: "series" }).content.title, "Mirzapur");
  assert.equal(pick(edges, { title: "Mirzapur", type: "movie" }), null, "a show isn't the film of the same name");
  assert.equal(pick(edges, { title: "PK", year: 2020 }), null, "wrong year");
});
