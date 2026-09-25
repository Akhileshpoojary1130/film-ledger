/* Iris — a person: portrait, who they are, and everything they directed, acted in or wrote. */
(function (FL) {
  "use strict";

  const { esc, $, plural } = FL.util;
  const { card } = FL.ui;

  const GROUPS = [["Director", "Directed"], ["Cast", "Acted in"], ["Writer", "Wrote"]];

  FL.views = FL.views || {};
  FL.views.person = {
    mount(el, params) {
      const name = decodeURIComponent(params[0] || "").trim();
      let alive = true;
      document.title = name + " · Iris";
      const known = FL.people.info(name);
      el.innerHTML = '<div class="container page person-page">' +
        '<header class="person-head">' + FL.people.face(name, 112) +
          '<div class="person-intro"><p class="eyebrow" data-pdesc>' + esc((known && known.d) || "Cast & crew") + "</p>" +
          '<h1 class="display">' + esc(name) + "</h1>" +
          '<p class="sub" data-pstats></p>' +
          '<p class="ext-links"><a class="link" target="_blank" rel="noopener noreferrer" href="https://en.wikipedia.org/wiki/' +
            encodeURIComponent(((known && known.t) || name).replace(/ /g, "_")) + '" data-pwiki>Wikipedia ↗</a>' +
          '<a class="link" target="_blank" rel="noopener noreferrer" href="https://www.imdb.com/find/?s=nm&q=' + encodeURIComponent(name) + '">IMDb ↗</a></p>' +
        "</div></header>" +
        '<div data-pworks><div class="rail-loading">' + FL.ui.loader(28, "Loading films") + "</div></div></div>";

      FL.people.photos([name]).then((map) => {
        if (!alive) return;
        FL.people.paint(el);
        const e = map[name];
        if (e && e.d) $("[data-pdesc]", el).textContent = e.d;
        if (e && e.t) $("[data-pwiki]", el).href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(e.t.replace(/ /g, "_"));
      });

      function paint(list) {
        const box = $("[data-pworks]", el);
        if (!list.length) {
          box.innerHTML = FL.ui.empty("No films found for " + esc(name) + ".", "IMDb may list them under a different spelling.");
          return;
        }
        const seen = list.filter((x) => FL.store.state(x.film.id).watched || FL.store.state(x.film.id).episodes).length;
        $("[data-pstats]", el).textContent = plural(list.length, "title") + (seen ? " · you’ve seen " + seen : "");
        box.innerHTML = GROUPS.map(([role, label]) => {
          const films = list.filter((x) => x.role === role).map((x) => x.film);
          if (!films.length) return "";
          return '<section class="rail"><header class="section-head"><div><h2 class="h2">' + label + ' <span class="muted">' + films.length + "</span></h2></div></header>" +
            '<div class="grid">' + films.map((f) => card(f)).join("") + "</div></section>";
        }).join("");
        FL.ui.watchPosters(box);
      }

      FL.people.filmography(name).then((list) => { if (alive) paint(list); })
        .catch(() => { if (alive) $("[data-pworks]", el).innerHTML = FL.ui.empty("Couldn’t load films.", "Check your connection and try again."); });

      return {
        update(detail) {
          if (detail.kind === "progress") return;
          FL.people.filmography(name).then((list) => {
            const stats = alive && $("[data-pstats]", el);
            if (!stats || !list.length) return;
            const seen = list.filter((x) => FL.store.state(x.film.id).watched || FL.store.state(x.film.id).episodes).length;
            stats.textContent = plural(list.length, "title") + (seen ? " · you’ve seen " + seen : "");
          });
        },
        destroy() { alive = false; },
      };
    },
  };
})(window.FL = window.FL || {});
