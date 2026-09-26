/* Iris — a small companion for long sessions. A cat (or a dog, or the Iris aperture) drops in at the top right,
   says one line — water, a stretch, rest your eyes, it's late — and leaves after five seconds.
   Time counts across the whole app: a minute counts while something plays or you did something in the last three.
   Twenty minutes away starts a new sitting. Settings → Home picks the companion, or turns it off. */
(function (FL) {
  "use strict";

  const { session, esc } = FL.util;
  const KEY = "film_ledger_care_v2";
  const IDLE = 3 * 60e3; // no input for this long (and nothing playing) = not using Iris
  const AWAY = 20 * 60e3; // a gap this long starts a new sitting

  /* Minutes into a sitting → what to say. After the list runs out it repeats every hour from the last one. */
  const PLAN = [
    [45, "water"],
    [90, "stretch"],
    [135, "eyes"],
    [180, "water"],
    [240, "break"],
  ];
  const LINES = {
    water: ["Sip some water?", "Water break! Your brain is 75% of it.", "A glass of water, then the next scene."],
    stretch: ["Stretch your arms up high. Like this!", "Roll your shoulders back a few times.", "Stand up for a minute, the film will wait."],
    eyes: ["Look at something far away for 20 seconds.", "Blink slowly a few times. Eyes like a nap too.", "Rest your eyes on the farthest thing you can see."],
    break: ["Four hours in! A proper break?", "Marathon mode. Walk around for five minutes?"],
    late: ["It's getting late. This one could finish tomorrow.", "Past midnight! Sleep is the best sequel."],
  };
  const EMOJI = { water: "💧", stretch: "🙆", eyes: "👀", break: "🚶", late: "🌙" };

  /* ---------- the companions (inline SVG, animated with CSS) ---------- */

  const FACES = {
    cat:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<path class="pet-tail" d="M50 56c9-3 11-13 6-19" fill="none" stroke="#D9803A" stroke-width="5" stroke-linecap="round"/>' +
        '<ellipse cx="32" cy="58" rx="17" ry="8" fill="#F2A65A"/>' +
        '<g class="pet-head">' +
          '<path class="pet-ear pet-ear-l" d="M15 27 17 7 30 19Z" fill="#F2A65A"/><path d="M18 22 19 12 26 19Z" fill="#F7B8C4"/>' +
          '<path class="pet-ear pet-ear-r" d="M49 27 47 7 34 19Z" fill="#F2A65A"/><path d="M46 22 45 12 38 19Z" fill="#F7B8C4"/>' +
          '<circle cx="32" cy="33" r="19" fill="#F2A65A"/>' +
          '<path d="M27 16v5M32 15v6M37 16v5" stroke="#D9803A" stroke-width="2.2" stroke-linecap="round"/>' +
          '<ellipse cx="32" cy="41" rx="10" ry="7" fill="#FCE3C8"/>' +
          '<g class="pet-eyes"><ellipse cx="24.5" cy="32" rx="3.2" ry="4.2" fill="#2A2320"/><ellipse cx="39.5" cy="32" rx="3.2" ry="4.2" fill="#2A2320"/>' +
            '<circle cx="25.6" cy="30.6" r="1.1" fill="#fff"/><circle cx="40.6" cy="30.6" r="1.1" fill="#fff"/></g>' +
          '<path d="M30 38.5h4l-2 2.2z" fill="#E67A8C"/>' +
          '<path d="M32 40.7c0 2-1.4 3-3 3M32 40.7c0 2 1.4 3 3 3" fill="none" stroke="#6B4A3A" stroke-width="1.2" stroke-linecap="round"/>' +
          '<path d="M20 39l-8-1.5M20 42l-8 1M44 39l8-1.5M44 42l8 1" stroke="#6B4A3A" stroke-width=".9" stroke-linecap="round" opacity=".55"/>' +
          '<circle cx="20" cy="38" r="2.6" fill="#F7A0B0" opacity=".45"/><circle cx="44" cy="38" r="2.6" fill="#F7A0B0" opacity=".45"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="24" cy="55" rx="5" ry="3.4" fill="#FCE3C8"/><ellipse class="pet-paw" cx="40" cy="55" rx="5" ry="3.4" fill="#FCE3C8"/>' +
      "</svg>",
    dog:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<path class="pet-tail" d="M49 55c8-2 10-9 8-14" fill="none" stroke="#A86B35" stroke-width="5" stroke-linecap="round"/>' +
        '<ellipse cx="32" cy="58" rx="17" ry="8" fill="#C98E52"/>' +
        '<g class="pet-head">' +
          '<circle cx="32" cy="32" r="18" fill="#C98E52"/>' +
          '<path class="pet-ear pet-ear-l" d="M16 20c-6 4-7 16-3 22 3 1 6-6 7-12z" fill="#7A4A26"/>' +
          '<path class="pet-ear pet-ear-r" d="M48 20c6 4 7 16 3 22-3 1-6-6-7-12z" fill="#7A4A26"/>' +
          '<ellipse cx="32" cy="41" rx="11" ry="8" fill="#F0D2AE"/>' +
          '<g class="pet-eyes"><circle cx="25" cy="31" r="3.2" fill="#2A2320"/><circle cx="39" cy="31" r="3.2" fill="#2A2320"/>' +
            '<circle cx="26" cy="30" r="1" fill="#fff"/><circle cx="40" cy="30" r="1" fill="#fff"/></g>' +
          '<ellipse cx="32" cy="37.5" rx="3.6" ry="2.6" fill="#2A2320"/>' +
          '<path d="M32 40v2.5M27.5 42.5c2 2 7 2 9 0" fill="none" stroke="#5A3A22" stroke-width="1.3" stroke-linecap="round"/>' +
          '<path class="pet-tongue" d="M30 44h4v3.5a2 2 0 0 1-4 0z" fill="#EF7A8E"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="24" cy="55" rx="5" ry="3.4" fill="#F0D2AE"/><ellipse class="pet-paw" cx="40" cy="55" rx="5" ry="3.4" fill="#F0D2AE"/>' +
      "</svg>",
  };

  function face(kind) {
    if (FACES[kind]) return FACES[kind];
    // The Iris character: the aperture with two blinking eyes.
    return '<span class="pet-iris">' + FL.theme.mark({ size: 44, open: 40 }) + "<i></i><i></i></span>";
  }

  const choice = () => {
    const p = (FL.store.prefs().care || {}).pet;
    return p === "dog" || p === "iris" || p === "off" ? p : "cat";
  };

  /* ---------- showing up ---------- */

  let current = null;
  function show(text, emoji, kind) {
    const pet = kind || choice();
    if (pet === "off") return;
    if (current) current.remove();
    const el = document.createElement("div");
    el.className = "pet pet-" + pet;
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="pet-face">' + face(pet) + "</span>" +
      '<span class="pet-bubble">' + esc(text) + (emoji ? ' <span class="pet-emoji">' + emoji + "</span>" : "") + "</span>";
    el.title = "Tap to dismiss";
    document.body.appendChild(el);
    current = el;
    const leave = () => {
      if (!el.isConnected || el.classList.contains("out")) return;
      el.classList.add("out");
      setTimeout(() => { el.remove(); if (current === el) current = null; }, 500);
    };
    el.addEventListener("click", leave);
    void el.offsetWidth; // start from the hidden state, then slide in (works even when frames are throttled)
    el.classList.add("in");
    setTimeout(leave, 5000);
  }

  /* ---------- counting the sitting ---------- */

  let lastInput = Date.now();
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach((t) => addEventListener(t, () => { lastInput = Date.now(); }, { passive: true, capture: true }));

  function state() {
    const s = session.get(KEY, { min: 0, at: 0, shown: [], late: false });
    if (Date.now() - s.at > AWAY) { s.min = 0; s.shown = []; }
    return s;
  }

  function due(min, shown) {
    for (const [m, kind] of PLAN) if (min >= m && shown.indexOf(m) === -1) return [m, kind];
    const last = PLAN[PLAN.length - 1][0];
    if (min >= last + 60) {
      const step = last + Math.floor((min - last) / 60) * 60;
      if (shown.indexOf(step) === -1) return [step, ["water", "stretch", "eyes"][(step / 60) % 3]];
    }
    return null;
  }

  const pick = (kind) => LINES[kind][Math.floor(Math.random() * LINES[kind].length)];

  function tick() {
    if (document.hidden) return;
    const watching = FL.player && FL.player.isOpen();
    if (!watching && Date.now() - lastInput > IDLE) return;
    const s = state();
    s.min += 1;
    s.at = Date.now();
    const h = new Date().getHours();
    const d = due(s.min, s.shown);
    if (d) {
      s.shown.push(d[0]);
      show(pick(d[1]), EMOJI[d[1]]);
    } else if (h < 4 && (h > 0 || new Date().getMinutes() >= 30) && s.min >= 20 && !s.late) {
      s.late = true;
      show(pick("late"), EMOJI.late);
    }
    session.set(KEY, s);
  }

  setInterval(tick, 60e3);

  FL.pet = {
    show,
    /* Settings' preview: the chosen companion says hello. */
    hello(kind) { show(kind === "dog" ? "Woof! I'll remind you to take breaks." : kind === "iris" ? "Hi! I'll check in on long sessions." : "Meow! I'll remind you to take breaks.", kind === "iris" ? "✨" : "🐾", kind); },
    choice,
  };
})(window.FL = window.FL || {});
