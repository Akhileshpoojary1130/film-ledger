/* Iris (demo) — playback and download links are not part of the public demo. Trailers still open (YouTube).
   The full player lives in the main branch. */
(function (FL) {
  "use strict";

  const { esc } = FL.util;

  function open(film, opts) {
    if (FL.ui && FL.ui.toast) FL.ui.toast("Playback isn't part of this demo. Trailers, tracking and everything else work.");
    if (opts && typeof opts.onClose === "function") setTimeout(opts.onClose, 0);
  }

  function trailer(film, ytId) {
    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(ytId) + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    FL.ui.modal(
      '<div class="trailer"><iframe src="' + src + '" title="' + esc(film.title) + ' trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>',
      { cls: "modal-trailer", label: film.title + " trailer" }
    );
  }

  FL.player = {
    SERVERS: [],
    open,
    close() {},
    trailer,
    probeAll: () => Promise.resolve([]),
    prefetch() {},
    season: () => Promise.resolve(null),
    vegaSearch: () => Promise.resolve([]),
    isOpen: () => false,
    current: () => null,
  };
})(window.FL = window.FL || {});
