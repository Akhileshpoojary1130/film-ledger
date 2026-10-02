/* Iris — motion: smooth wheel scrolling (Lenis), magnetic buttons, and the headline arriving word by word.
   Scrolling and magnets need a mouse or trackpad (touch screens keep their own scrolling, which is already smooth).
   Smooth scrolling is how scrolling feels, not an effect, so only the system's "reduce motion" turns it off; the
   magnets and the headline follow Motion (Full / Calm) in Settings. Loaded last. */
(function (FL) {
  "use strict";

  const LENIS = "https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js";
  const root = document.documentElement;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const full = () => !FL.theme.calm();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const glide = () => fine.matches && !reduced.matches;

  /* ---------- smooth scrolling ---------- */

  let lenis = null;
  let raf = 0;
  let loading = null;

  function load() {
    if (window.Lenis) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LENIS;
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  function startScroll() {
    if (lenis || !glide()) return;
    load().then(() => {
      if (lenis || !glide() || !window.Lenis) return;
      lenis = new window.Lenis({
        duration: 1.05,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        smoothWheel: true,
        // Sheets, the player and rows that scroll on their own keep their own scrolling.
        prevent: (node) => !!(node.closest && node.closest(".modal-backdrop, .player, .palette-list, .rail-track, .tn-list, .palette-row, .sakura-years, .az-strip, .tabs, .seg, .chip-row, [data-lenis-prevent]")),
      });
      const loop = (t) => {
        if (!lenis) return;
        lenis.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      hold();
    }).catch(() => { loading = null; }); // offline or blocked: the page simply scrolls as usual
  }

  function stopScroll() {
    if (!lenis) return;
    cancelAnimationFrame(raf);
    lenis.destroy();
    lenis = null;
  }

  // A sheet or the player holds the page still underneath.
  function hold() {
    if (!lenis) return;
    if (root.classList.contains("has-modal") || root.classList.contains("has-player")) lenis.stop();
    else lenis.start();
  }

  // A new page starts where the router puts it, not where a glide was heading.
  window.addEventListener("hashchange", () => { if (lenis) lenis.scrollTo(window.scrollY, { immediate: true, force: true }); });

  /* ---------- magnetic buttons ---------- */

  const MAGNETS = ".btn-primary, .tn-play, .icon-btn, .app-seg, .tab-browse, .link-more, .hero-search kbd";
  let magnet = null;

  function release() {
    const el = magnet;
    magnet = null;
    if (!el) return;
    const from = el.style.translate;
    el.style.translate = "";
    if (from && el.animate) el.animate([{ translate: from }, { translate: "0 0" }], { duration: 420, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.35)" });
  }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !full()) { if (magnet) release(); return; }
    const el = e.target.closest ? e.target.closest(MAGNETS) : null;
    if (magnet && magnet !== el) release();
    if (!el || el.disabled) return;
    magnet = el;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const pull = Math.min(7, Math.max(3, r.width * 0.07));
    el.style.translate = (dx * pull).toFixed(1) + "px " + (dy * pull * 0.6).toFixed(1) + "px";
  }, { passive: true });
  document.addEventListener("pointerout", (e) => { if (magnet && (!e.relatedTarget || !magnet.contains(e.relatedTarget))) release(); }, true);

  /* ---------- the headline, word by word ---------- */

  function splitHeadlines() {
    document.querySelectorAll(".hero-words:not([data-split])").forEach((h) => {
      h.dataset.split = "1";
      let i = 0;
      const walk = (node) => {
        Array.from(node.childNodes).forEach((n) => {
          if (n.nodeType === 1) { walk(n); return; }
          if (n.nodeType !== 3 || !n.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement("span");
            w.className = "word";
            w.style.setProperty("--i", i++);
            w.textContent = part;
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        });
      };
      walk(h);
    });
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; splitHeadlines(); });
  }).observe(document.getElementById("view") || document.body, { childList: true, subtree: true });

  /* ---------- follow the settings ---------- */

  function sync() {
    if (glide()) startScroll(); else stopScroll();
    hold();
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["class", "data-motion"] });
  fine.addEventListener("change", sync);
  reduced.addEventListener("change", sync);
  splitHeadlines();
  FL.util.idle(sync);

  FL.motion = { scrollTo: (y) => (lenis ? lenis.scrollTo(y) : window.scrollTo({ top: y, behavior: "smooth" })) };
})(window.FL = window.FL || {});
