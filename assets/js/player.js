/* Iris (demo): Play buttons are shown but open a note instead of the player. Trailers still open (YouTube).
   The full player lives in the main branch. */
(function (FL) {
  "use strict";

  const { esc } = FL.util;

  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  // Shown whenever someone presses Play: the button is there, playback is not.
  function blocked() {
    if (!FL.ui || !FL.ui.modal) return;
    FL.ui.modal(
      '<div class="demo-block"><div class="demo-lock">' + LOCK + "</div><h3>Playback is off in this demo</h3>" +
        "<p>Everything else works as in the full app: browsing, your diary, lists, recommendations and trailers. Playing films and episodes is turned off in the public demo.</p>" +
        '<button type="button" class="btn btn-primary" data-close autofocus>Got it</button></div>',
      { cls: "modal-demo", label: "Playback is off in this demo" }
    );
  }

  function open(film, opts) {
    // Leave the watch page first (that closes any open dialog), then explain.
    if (opts && typeof opts.onClose === "function") setTimeout(opts.onClose, 0);
    setTimeout(blocked, 280);
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
    blocked,
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
