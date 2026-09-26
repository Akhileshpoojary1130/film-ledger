/* Iris — everything by one person, to pick what to watch next. No biography: just their films. */
(function (FL) {
  "use strict";

  const { esc, $, plural } = FL.util;
  const { card } = FL.ui;

  const VIEWS = [["newest", "Newest"], ["rated", "Best rated"], ["todo", "To watch"]];

  FL.views = FL.views || {};
  FL.views.person = {
    mount(el, params) {
      const name = decodeURIComponent(params[0] || "").trim();
      let alive = true;
      let list = [];
      let view = "newest";
      document.title = name + " · Iris";
      el.innerHTML = '<div class="container page person-page">' +
        '<header class="person-head">' + FL.people.face(name, 64) +
          '<div class="person-intro"><h1 class="h1">' + esc(name) + '</h1><p class="sub" data-pstats>Finding their films…</p></div>' +
        "</header>" +
        '<div class="filter-row person-filters">' + FL.ui.segmented("pview", VIEWS, view) + "</div>" +
        '<div data-pworks><div class="rail-loading">' + FL.ui.loader(28, "Loading films") + "</div></div></div>";

      FL.people.photos([name]).then(() => { if (alive) FL.people.paint(el); });

      const seen = (f) => FL.store.state(f.id).watched || FL.store.state(f.id).episodes;

      function stats() {
        const n = list.filter((x) => seen(x.film)).length;
        $("[data-pstats]", el).textContent = plural(list.length, "title") + (n ? " · you’ve seen " + n : "");
      }

      function paint() {
        const box = $("[data-pworks]", el);
        if (!list.length) {
          box.innerHTML = FL.ui.empty("No films found for " + esc(name) + ".", "IMDb may list them under a different spelling.");
          $("[data-pstats]", el).textContent = "";
          return;
        }
        stats();
        let films = list.slice();
        if (view === "todo") films = films.filter((x) => !seen(x.film));
        if (view === "rated") films.sort((a, b) => (b.film.rating || 0) - (a.film.rating || 0));
        box.innerHTML = films.length
          ? '<div class="grid">' + films.map((x) => card(x.film, { caption: x.roles.filter((r) => r !== "Cast").join(" · ") })).join("") + "</div>"
          : FL.ui.empty("You’ve seen everything here.", "Nice.");
        FL.ui.watchPosters(box);
      }

      FL.people.filmography(name).then((works) => {
        if (!alive) return;
        // One card per title, with every role they had on it.
        const byId = new Map();
        works.forEach((x) => {
          const cur = byId.get(x.film.id);
          if (cur) { if (cur.roles.indexOf(x.role) === -1) cur.roles.push(x.role); }
          else byId.set(x.film.id, { film: x.film, roles: [x.role] });
        });
        list = Array.from(byId.values());
        paint();
        // Titles that came only from Wikidata get their rating, genres and language filled in quietly.
        list.filter((x) => x.film.remote && !x.film.rating).slice(0, 40).forEach((x) => {
          FL.meta.details(x.film).then(() => { if (alive) FL.ui.refreshFilm(x.film.id); });
        });
      }).catch(() => { if (alive) $("[data-pworks]", el).innerHTML = FL.ui.empty("Couldn’t load films.", "Check your connection and try again."); });

      function onClick(e) {
        const seg = e.target.closest('[data-seg="pview"]');
        if (!seg) return;
        view = seg.dataset.value;
        seg.parentNode.querySelectorAll(".seg-btn").forEach((b) => { b.classList.toggle("is-on", b === seg); b.setAttribute("aria-checked", b === seg); });
        paint();
      }
      el.addEventListener("click", onClick);

      return {
        update(detail) { if (detail.kind !== "progress" && list.length) stats(); },
        destroy() { alive = false; el.removeEventListener("click", onClick); },
      };
    },
  };
})(window.FL = window.FL || {});
