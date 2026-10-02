/* Iris — page sweep. With Iris open, paste this into the console (or `await import("/tests/smoke.js")`).
   It visits every route, scrolls each page through, and prints a table: errors thrown, pages that broke, content wider
   than the screen, and sections whose scroll-in animation never finished. Run it at phone and desktop widths. */
(async () => {
  "use strict";
  const FL = window.FL;
  if (!FL || !FL.started) { console.warn("Open Iris first, then run the sweep."); return; }
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const errors = [];
  const onError = (e) => errors.push(e.message || (e.target && (e.target.src || e.target.href)) || "error");
  const onRejection = (e) => errors.push("rejection: " + String((e.reason && e.reason.message) || e.reason));
  addEventListener("error", onError, true);
  addEventListener("unhandledrejection", onRejection);

  const cols = FL.catalogue.collections();
  const film = FL.catalogue.search("KGF Chapter 2").items[0] || FL.catalogue.films[0];
  const routes = [
    "#/", "#/years", "#/years/1995", "#/browse", "#/browse?q=action", "#/shows", "#/show/tt6473300",
    "#/film/" + encodeURIComponent(film.id), "#/film/tt0816692",
    "#/library/watchlist", "#/library/watched", "#/library/favorites", "#/library/shows",
    "#/diary", "#/stats", "#/collections", cols[0] ? "#/collection/" + cols[0].id : "",
    "#/person/" + encodeURIComponent("Christopher Nolan") + "?as=crew", "#/move", "#/match", "#/no-such-page",
    // Sakura, the anime app
    "#/anime", "#/anime/seasons", "#/anime/explore?genre=Action", "#/anime/az/a", "#/anime/library", "#/anime/an154587", "#/anime/zr-naruto",
    "#/anime/collections", "#/anime/collection/an16498",
  ].filter(Boolean);

  // Anything poking out sideways that isn't inside something meant to scroll or clip.
  function wide() {
    const W = innerWidth;
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll("#view *, .topbar *, .tabbar *")) {
      if (el.closest("svg")) continue;
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > W + 1 || b.left < -1) && getComputedStyle(el).position !== "fixed" && !clipped(el)) {
        out.push((typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase()));
        if (out.length > 3) break;
      }
    }
    return out;
  }

  const rows = [];
  const start = location.hash;
  for (const route of routes) {
    errors.length = 0;
    location.hash = route;
    await pause(1800);
    const H = document.scrollingElement.scrollHeight;
    for (let y = 0; y <= H; y += innerHeight * 0.9) { scrollTo(0, y); await pause(80); }
    await pause(700);
    const view = document.getElementById("view");
    const stuck = [...document.querySelectorAll("#view .reveal:not(.in)")].filter((el) => el.getBoundingClientRect().height > 0);
    rows.push({
      route,
      page: /Something went wrong|hit a problem/.test(view.textContent) ? "BROKEN" : "ok",
      errors: errors.filter((e) => !/\/img$|poster/.test(e)).slice(0, 2).join(" | "),
      tooWide: wide().join(" "),
      stuckAnimations: stuck.length || "",
    });
    scrollTo(0, 0);
  }
  location.hash = start || "#/";
  removeEventListener("error", onError, true);
  removeEventListener("unhandledrejection", onRejection);

  const bad = rows.filter((r) => r.page !== "ok" || r.errors || r.tooWide || r.stuckAnimations);
  console.table(rows);
  console.log(bad.length ? bad.length + " of " + rows.length + " pages need a look." : "All " + rows.length + " pages clean at " + innerWidth + "px.");
  window.__irisSmoke = rows;
  return rows;
})();
