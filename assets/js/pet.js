/* Iris — Pause Pals: a small companion for long sessions. A cat (or a dog, bunny, panda, fox, penguin, owl, koala,
   chick, the Iris eye, or a different one each time) drops in at the top right, says one line — sit up, water, rest
   your eyes, a stretch, a light snack, three episodes in a row, it's late — acts it out (a hop, a stretch, a slow
   blink, a snooze) and leaves after five seconds.
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
    [25, "posture"],
    [45, "water"],
    [70, "eyes"],
    [95, "stretch"],
    [120, "snack"],
    [150, "water"],
    [180, "break"],
    [240, "break"],
  ];
  const LINES = {
    water: ["Sip some water?", "Water break! Your brain is 75% of it.", "A glass of water, then the next scene."],
    stretch: ["Stretch your arms up high. Like this!", "Roll your shoulders back a few times.", "Stand up for a minute, the film will wait."],
    eyes: ["Look at something far away for 20 seconds.", "Blink slowly a few times. Eyes like a nap too.", "Rest your eyes on the farthest thing you can see."],
    break: ["Four hours in! A proper break?", "Marathon mode. Walk around for five minutes?"],
    late: ["It's getting late. This one could finish tomorrow.", "Past midnight! Sleep is the best sequel."],
    posture: ["Sit back, shoulders down. Comfy?", "Quick posture check: back straight, screen at eye level.", "Unclench your jaw. Better?"],
    snack: ["Snack time? Fruit or nuts beat another packet of chips.", "Hungry? Grab something light, the scene will keep."],
    binge: ["Three episodes in a row! Stand up before the next?", "Binge mode on. A two-minute walk, then back?"],
  };
  const EMOJI = { water: "💧", stretch: "🙆", eyes: "👀", break: "🚶", late: "🌙", posture: "🪑", snack: "🍎", binge: "📺" };
  /* What the companion does while it talks: hop for water, stretch, a slow blink for the eyes, snooze at night. */
  const ACTION = { water: "hop", stretch: "stretch", eyes: "blink", break: "hop", late: "sleep", posture: "stretch", snack: "hop", binge: "wave", hello: "wave" };

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
    bunny:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<circle class="pet-tail" cx="50" cy="56" r="4.5" fill="#FFFFFF"/>' +
        '<ellipse cx="32" cy="58" rx="16" ry="8" fill="#F1ECE4"/>' +
        '<g class="pet-head">' +
          '<g class="pet-ear pet-ear-l"><ellipse cx="24" cy="9" rx="5.2" ry="13" transform="rotate(-10 24 20)" fill="#F1ECE4"/><ellipse cx="24" cy="10" rx="2.4" ry="9" transform="rotate(-10 24 20)" fill="#F7B8C4"/></g>' +
          '<g class="pet-ear pet-ear-r"><ellipse cx="40" cy="9" rx="5.2" ry="13" transform="rotate(10 40 20)" fill="#F1ECE4"/><ellipse cx="40" cy="10" rx="2.4" ry="9" transform="rotate(10 40 20)" fill="#F7B8C4"/></g>' +
          '<circle cx="32" cy="34" r="17" fill="#F1ECE4"/>' +
          '<g class="pet-eyes"><ellipse cx="25" cy="32" rx="2.8" ry="3.6" fill="#2A2320"/><ellipse cx="39" cy="32" rx="2.8" ry="3.6" fill="#2A2320"/>' +
            '<circle cx="26" cy="31" r="1" fill="#fff"/><circle cx="40" cy="31" r="1" fill="#fff"/></g>' +
          '<path d="M30 38h4l-2 2z" fill="#E67A8C"/><path d="M32 40c0 2-1.5 2.8-3 2.6M32 40c0 2 1.5 2.8 3 2.6" fill="none" stroke="#6B4A3A" stroke-width="1.1" stroke-linecap="round"/>' +
          '<rect x="30.6" y="41.6" width="2.8" height="2.6" rx=".6" fill="#fff" stroke="#E2DDD4" stroke-width=".5"/>' +
          '<circle cx="21" cy="38" r="2.6" fill="#F7A0B0" opacity=".5"/><circle cx="43" cy="38" r="2.6" fill="#F7A0B0" opacity=".5"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="25" cy="55" rx="4.6" ry="3.2" fill="#FFFFFF"/><ellipse class="pet-paw" cx="39" cy="55" rx="4.6" ry="3.2" fill="#FFFFFF"/>' +
      "</svg>",
    panda:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<ellipse cx="32" cy="58" rx="18" ry="8" fill="#F4F4F2"/>' +
        '<g class="pet-head">' +
          '<circle class="pet-ear pet-ear-l" cx="17" cy="19" r="6.5" fill="#23232A"/><circle class="pet-ear pet-ear-r" cx="47" cy="19" r="6.5" fill="#23232A"/>' +
          '<circle cx="32" cy="34" r="18.5" fill="#F4F4F2"/>' +
          '<ellipse cx="24.5" cy="33" rx="5" ry="6.5" transform="rotate(25 24.5 33)" fill="#23232A"/><ellipse cx="39.5" cy="33" rx="5" ry="6.5" transform="rotate(-25 39.5 33)" fill="#23232A"/>' +
          '<g class="pet-eyes"><circle cx="25" cy="33" r="2.2" fill="#fff"/><circle cx="39" cy="33" r="2.2" fill="#fff"/><circle cx="25.4" cy="33.2" r="1.2" fill="#23232A"/><circle cx="39.4" cy="33.2" r="1.2" fill="#23232A"/></g>' +
          '<ellipse cx="32" cy="40" rx="3.2" ry="2.2" fill="#23232A"/>' +
          '<path d="M32 42v1.6M29 44c1.6 1.4 4.4 1.4 6 0" fill="none" stroke="#23232A" stroke-width="1.2" stroke-linecap="round"/>' +
          '<circle cx="20" cy="41" r="2.6" fill="#F7A0B0" opacity=".45"/><circle cx="44" cy="41" r="2.6" fill="#F7A0B0" opacity=".45"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="23" cy="55" rx="5.5" ry="3.8" fill="#23232A"/><ellipse class="pet-paw" cx="41" cy="55" rx="5.5" ry="3.8" fill="#23232A"/>' +
      "</svg>",
    fox:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<g class="pet-tail"><path d="M47 58c12-1 16-12 11-21-4 6-9 9-13 11z" fill="#E8742A"/><path d="M56 40c3 4 2 8 1 10-2-1-4-3-4-6z" fill="#FFF3E6"/></g>' +
        '<ellipse cx="32" cy="58" rx="16" ry="8" fill="#E8742A"/><ellipse cx="32" cy="59" rx="8" ry="5" fill="#FFF3E6"/>' +
        '<g class="pet-head">' +
          '<path class="pet-ear pet-ear-l" d="M14 28 16 6 30 18Z" fill="#E8742A"/><path d="M17 21 18 11 25 17Z" fill="#3A2A22"/>' +
          '<path class="pet-ear pet-ear-r" d="M50 28 48 6 34 18Z" fill="#E8742A"/><path d="M47 21 46 11 39 17Z" fill="#3A2A22"/>' +
          '<path d="M13 30c0-11 9-17 19-17s19 6 19 17c0 9-8 17-19 17S13 39 13 30z" fill="#E8742A"/>' +
          '<path d="M14 33c5 1 11 4 18 13 7-9 13-12 18-13-2 8-9 14-18 14S16 41 14 33z" fill="#FFF3E6"/>' +
          '<g class="pet-eyes"><ellipse cx="24.5" cy="30" rx="2.6" ry="3.4" fill="#2A2320"/><ellipse cx="39.5" cy="30" rx="2.6" ry="3.4" fill="#2A2320"/>' +
            '<circle cx="25.4" cy="29" r=".9" fill="#fff"/><circle cx="40.4" cy="29" r=".9" fill="#fff"/></g>' +
          '<ellipse cx="32" cy="41" rx="2.6" ry="1.9" fill="#2A2320"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="25" cy="55" rx="4.6" ry="3.2" fill="#3A2A22"/><ellipse class="pet-paw" cx="39" cy="55" rx="4.6" ry="3.2" fill="#3A2A22"/>' +
      "</svg>",
    penguin:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<ellipse cx="32" cy="57" rx="17" ry="9" fill="#2B3040"/><ellipse cx="32" cy="58" rx="11" ry="7" fill="#F7F7F4"/>' +
        '<g class="pet-head">' +
          '<circle cx="32" cy="32" r="19" fill="#2B3040"/>' +
          '<path d="M32 22c-4-5-13-4-14 4-1 7 3 15 14 18 11-3 15-11 14-18-1-8-10-9-14-4z" fill="#F7F7F4"/>' +
          '<g class="pet-eyes"><ellipse cx="26" cy="30" rx="2.4" ry="3" fill="#2A2320"/><ellipse cx="38" cy="30" rx="2.4" ry="3" fill="#2A2320"/>' +
            '<circle cx="26.8" cy="29" r=".9" fill="#fff"/><circle cx="38.8" cy="29" r=".9" fill="#fff"/></g>' +
          '<path d="M28.5 35h7l-3.5 4z" fill="#F5A524"/>' +
          '<circle cx="22" cy="36" r="2.4" fill="#F7A0B0" opacity=".5"/><circle cx="42" cy="36" r="2.4" fill="#F7A0B0" opacity=".5"/>' +
        "</g>" +
        '<path class="pet-paw" d="M15 46c-4 3-5 8-3 10 3-1 6-4 7-8z" fill="#2B3040"/><path class="pet-paw" d="M49 46c4 3 5 8 3 10-3-1-6-4-7-8z" fill="#2B3040"/>' +
        '<ellipse cx="26" cy="63" rx="4" ry="1.6" fill="#F5A524"/><ellipse cx="38" cy="63" rx="4" ry="1.6" fill="#F5A524"/>' +
      "</svg>",
    owl:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<ellipse cx="32" cy="57" rx="17" ry="9" fill="#8A5A36"/><path d="M24 52q8 5 16 0M25 57q7 4 14 0" fill="none" stroke="#C99A6B" stroke-width="1.4" stroke-linecap="round"/>' +
        '<g class="pet-head">' +
          '<path class="pet-ear pet-ear-l" d="M14 22 15 8 25 16Z" fill="#8A5A36"/><path class="pet-ear pet-ear-r" d="M50 22 49 8 39 16Z" fill="#8A5A36"/>' +
          '<circle cx="32" cy="32" r="19" fill="#8A5A36"/>' +
          '<circle cx="24" cy="31" r="8" fill="#F6E7CF"/><circle cx="40" cy="31" r="8" fill="#F6E7CF"/>' +
          '<g class="pet-eyes"><circle cx="24" cy="31" r="4.4" fill="#2A2320"/><circle cx="40" cy="31" r="4.4" fill="#2A2320"/>' +
            '<circle cx="25.4" cy="29.6" r="1.4" fill="#fff"/><circle cx="41.4" cy="29.6" r="1.4" fill="#fff"/></g>' +
          '<path d="M29.5 37h5l-2.5 4.5z" fill="#F5A524"/>' +
        "</g>" +
        '<path class="pet-paw" d="M14 44c-3 4-3 9 0 12 3-2 5-6 5-11z" fill="#6E452A"/><path class="pet-paw" d="M50 44c3 4 3 9 0 12-3-2-5-6-5-11z" fill="#6E452A"/>' +
      "</svg>",
    koala:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<ellipse cx="32" cy="58" rx="16" ry="8" fill="#9AA3AD"/>' +
        '<g class="pet-head">' +
          '<circle class="pet-ear pet-ear-l" cx="13" cy="22" r="10" fill="#9AA3AD"/><circle cx="13" cy="22" r="5.5" fill="#E9D8D2"/>' +
          '<circle class="pet-ear pet-ear-r" cx="51" cy="22" r="10" fill="#9AA3AD"/><circle cx="51" cy="22" r="5.5" fill="#E9D8D2"/>' +
          '<circle cx="32" cy="33" r="18" fill="#AEB6BF"/>' +
          '<g class="pet-eyes"><circle cx="25" cy="30" r="3" fill="#2A2320"/><circle cx="39" cy="30" r="3" fill="#2A2320"/>' +
            '<circle cx="26" cy="29" r="1" fill="#fff"/><circle cx="40" cy="29" r="1" fill="#fff"/></g>' +
          '<ellipse cx="32" cy="38" rx="5.5" ry="7" fill="#3A3F46"/><ellipse cx="30.5" cy="35" rx="1.6" ry="1" fill="#fff" opacity=".35"/>' +
          '<circle cx="21" cy="39" r="2.6" fill="#F7A0B0" opacity=".4"/><circle cx="43" cy="39" r="2.6" fill="#F7A0B0" opacity=".4"/>' +
        "</g>" +
        '<ellipse class="pet-paw" cx="24" cy="55" rx="5" ry="3.4" fill="#C9CFD5"/><ellipse class="pet-paw" cx="40" cy="55" rx="5" ry="3.4" fill="#C9CFD5"/>' +
      "</svg>",
    chick:
      '<svg class="pet-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<ellipse cx="32" cy="60" rx="13" ry="3" fill="#000" opacity=".12"/>' +
        '<g class="pet-head">' +
          '<path d="M30 12c1-5 6-6 7-2-3 0-4 1-5 3" fill="#F7C548"/>' +
          '<circle cx="32" cy="36" r="21" fill="#FFD84D"/>' +
          '<g class="pet-eyes"><circle cx="25" cy="32" r="3" fill="#2A2320"/><circle cx="39" cy="32" r="3" fill="#2A2320"/>' +
            '<circle cx="26" cy="31" r="1" fill="#fff"/><circle cx="40" cy="31" r="1" fill="#fff"/></g>' +
          '<path d="M28 38h8l-4 5z" fill="#F28C28"/>' +
          '<circle cx="20" cy="40" r="2.6" fill="#F7A0B0" opacity=".5"/><circle cx="44" cy="40" r="2.6" fill="#F7A0B0" opacity=".5"/>' +
        "</g>" +
        '<path class="pet-paw" d="M11 38c-4 3-4 9 1 11 2-3 3-7 2-11z" fill="#F7C548"/><path class="pet-paw" d="M53 38c4 3 4 9-1 11-2-3-3-7-2-11z" fill="#F7C548"/>' +
        '<path d="M26 56v4M24 60h4M38 56v4M36 60h4" stroke="#F28C28" stroke-width="1.8" stroke-linecap="round"/>' +
      "</svg>",
  };

  function face(kind) {
    if (FACES[kind]) return FACES[kind];
    // The Iris character: the mark itself, an eye that blinks.
    return '<span class="pet-iris">' + FL.theme.mark({ size: 44, open: 0.75 }) + "</span>";
  }

  /* Settings' choices, in order. "mix" sends a different friend each time. */
  const PETS = [["cat", "Cat"], ["dog", "Dog"], ["bunny", "Bunny"], ["panda", "Panda"], ["fox", "Fox"], ["penguin", "Penguin"], ["owl", "Owl"],
    ["koala", "Koala"], ["chick", "Chick"], ["iris", "Iris"], ["mix", "Mix"], ["off", "Off"]];
  const HELLO = {
    cat: ["Meow! I'll remind you to take breaks.", "🐾"], dog: ["Woof! I'll remind you to take breaks.", "🐾"],
    bunny: ["Hop hop! I'll nudge you to rest.", "🥕"], panda: ["Hi! Snack, stretch, repeat. I'll remind you.", "🎋"],
    fox: ["Psst. I'll tell you when it's break time.", "🦊"], penguin: ["Waddle break reminders, on duty.", "🐧"],
    owl: ["Hoo! I'll keep an eye on the clock.", "🌙"], iris: ["Hi! I'll check in on long sessions.", "✨"],
    koala: ["G'day! I'll tell you when to stretch.", "🌿"], chick: ["Peep! Water, stretch, rest. I've got you.", "🐣"],
  };
  const choice = () => {
    const p = (FL.store.prefs().care || {}).pet;
    return PETS.some(([k]) => k === p) ? p : "cat";
  };
  let lastMix = "";
  function resolvePet(kind) {
    if (kind !== "mix") return kind;
    const pool = PETS.map(([k]) => k).filter((k) => k !== "mix" && k !== "off" && k !== lastMix);
    lastMix = pool[Math.floor(Math.random() * pool.length)];
    return lastMix;
  }

  /* ---------- showing up ---------- */

  let current = null;
  let waiting = null; // a reminder held back while a video site's own fullscreen hides everything else

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  const SHOW_FOR = 10; // seconds: long enough to read, with a countdown so it's clear when it goes

  function show(text, emoji, kind, act) {
    const chosen = kind || choice();
    if (chosen === "off") return;
    const pet = resolvePet(chosen);
    const fs = fsElement();
    const hostFs = !!(fs && fs.tagName === "IFRAME");
    if (current) current.remove();
    const el = document.createElement("div");
    el.className = "pet pet-" + pet + (act ? " act-" + act : "");
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="pet-face">' + face(pet) + "</span>" +
      '<span class="pet-bubble">' + esc(text) + (emoji ? ' <span class="pet-emoji">' + emoji + "</span>" : "") + "</span>" +
      '<span class="pet-count" aria-hidden="true">' + SHOW_FOR + "</span>" +
      '<i class="pet-bar" aria-hidden="true" style="animation-duration:' + SHOW_FOR + 's"></i>';
    el.title = "Tap to dismiss";
    (fs && !hostFs ? fs : document.body).appendChild(el); // inside Iris's fullscreen player, so it shows over the film
    // A video site's own fullscreen covers the page: show it in the browser's top layer, else say it afterwards.
    if (hostFs && !FL.ui.overTop(el)) { el.remove(); waiting = [text, emoji, kind, Date.now()]; return; }
    current = el;
    let left = SHOW_FOR;
    const count = el.querySelector(".pet-count");
    const tick = setInterval(() => { left -= 1; if (left > 0) count.textContent = left; }, 1000);
    const leave = () => {
      clearInterval(tick);
      if (!el.isConnected || el.classList.contains("out")) return;
      el.classList.add("out");
      setTimeout(() => { el.remove(); if (current === el) current = null; }, 500);
    };
    el.addEventListener("click", leave);
    void el.offsetWidth; // start from the hidden state, then slide in (works even when frames are throttled)
    el.classList.add("in");
    setTimeout(leave, SHOW_FOR * 1000);
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
      show(pick(d[1]), EMOJI[d[1]], null, ACTION[d[1]]);
    } else if (h < 4 && (h > 0 || new Date().getMinutes() >= 30) && s.min >= 20 && !s.late) {
      s.late = true;
      show(pick("late"), EMOJI.late, null, ACTION.late);
    }
    session.set(KEY, s);
  }

  setInterval(tick, 60e3);

  // Out of a video site's own fullscreen: say what was held back (if it's still recent).
  const released = () => {
    if (!waiting || fsElement()) return;
    const [text, emoji, kind, at] = waiting;
    waiting = null;
    if (Date.now() - at < 10 * 60e3) setTimeout(() => show(text, emoji, kind), 600);
  };
  document.addEventListener("fullscreenchange", released);
  document.addEventListener("webkitfullscreenchange", released);

  FL.pet = {
    show,
    /* Settings' preview: the chosen companion says hello. */
    hello(kind) {
      const pet = resolvePet(kind);
      const [text, emoji] = HELLO[pet] || HELLO.cat;
      show(text, emoji, pet, "wave");
    },
    /* The player, after each episode it logs: three in a row in one sitting, and the companion suggests a break. */
    onEpisode() {
      const s = state();
      s.eps = (s.eps || 0) + 1;
      session.set(KEY, s);
      if (s.eps % 3 === 0) setTimeout(() => show(pick("binge"), EMOJI.binge, null, ACTION.binge), 4000);
    },
    choice,
    PETS,
    face,
  };
})(window.FL = window.FL || {});
