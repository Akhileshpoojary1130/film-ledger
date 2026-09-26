/* Iris — voice: what the app says, and in what type.
   The Home headline follows the time of day (early morning … late night), checks in around meals, and is picked
   from a set of lines that changes every six hours (midnight, 6, noon, 6) and reads differently the next day.
   Its typeface follows your mood: the genres of what you've been watching lately. Only that one line changes font. */
(function (FL) {
  "use strict";

  const { hash } = FL.util;

  /* [from hour, id, eyebrow greeting] */
  const SLOTS = [
    [0, "late", "Late night"],
    [4, "dawn", "Early bird"],
    [7, "morning", "Good morning"],
    [12, "lunch", "Good afternoon"],
    [15, "afternoon", "Good afternoon"],
    [18, "evening", "Good evening"],
    [20, "dinner", "Good evening"],
    [22, "night", "Tonight"],
  ];

  /* Each line: [plain part, emphasised part]. */
  const LINES = {
    late: [["Still up?", "Something short, then sleep."], ["The late show", "is on."], ["Can't sleep?", "Neither can cinema."], ["It's late,", "maybe a comfort watch."], ["Night owl mode.", "Pick gently."], ["Quiet house,", "loud film?"]],
    dawn: [["Up before the sun?", "Something gentle, then."], ["Early start.", "A short one before the day?"], ["Morning light,", "quiet cinema."], ["First chai,", "first frame."]],
    morning: [["Good morning.", "What's on the reel today?"], ["Coffee first,", "then a classic?"], ["A fresh day", "for a fresh film."], ["Slow morning?", "Queue something for tonight."], ["Rise and shine,", "roll the credits later."]],
    lunch: [["Had lunch yet?", "Grab a bite, pick a film."], ["How was lunch?", "Here's dessert."], ["Lunch break?", "Something under two hours."], ["Eat first.", "The film can wait five minutes."], ["Lunch sorted?", "Let's find a side of cinema."]],
    afternoon: [["Slow afternoon?", "Make it a matinee."], ["Afternoon matinee,", "anyone?"], ["Tea and", "a good story?"], ["Post-lunch slump?", "A lively one, then."], ["Drink some water,", "then pick a film."]],
    evening: [["Evening's here.", "What's the mood?"], ["Done for the day?", "Put your feet up."], ["Golden hour,", "golden films."], ["Long day?", "Let a story carry you."]],
    dinner: [["Had dinner?", "Pick something for after."], ["Dinner and", "a film, the classic pairing."], ["Plates down,", "lights down."], ["Food's ready?", "So is the screen."]],
    night: [["What are we", "watching tonight?"], ["Lights down,", "screen up."], ["Tonight's feature", "is your call."], ["One more before bed?", "Make it a good one."], ["Settle in.", "Something worth staying up for."]],
  };

  /* A little variety at the bottom of every page — no small print. */
  const SIGNOFFS = ["That's a wrap.", "Roll credits.", "Fin.", "See you at the next screening.", "Popcorn's on you next time.", "Lights up.", "The end. For now."];

  function slotAt(h) {
    let s = SLOTS[0];
    SLOTS.forEach((x) => { if (h >= x[0]) s = x; });
    return s;
  }

  /* Same line for six hours; tomorrow's six hours pick a different one. */
  function pick(list, salt) {
    const d = new Date();
    const block = Math.floor(d.getHours() / 6);
    const key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() + "|" + block + "|" + salt;
    return list[hash(key) % list.length];
  }

  function greeting(name) {
    const [, id, hello] = slotAt(new Date().getHours());
    return { id, eyebrow: hello + (name ? ", " + name : ""), line: pick(LINES[id], id) };
  }

  const signoff = () => pick(SIGNOFFS, "signoff");

  /* ---------- mood type ---------- */

  const MOODS = [
    { id: "eerie", genres: ["Horror"], font: "Creepster", size: 1.02, track: "0.02em" },
    { id: "tense", genres: ["Thriller", "Mystery", "Crime", "Film-Noir"], font: "Special Elite", size: 0.86, track: "-0.01em" },
    { id: "bold", genres: ["Action", "Adventure", "War", "Western", "Sport"], font: "Bebas Neue", size: 1.18, track: "0.01em" },
    { id: "future", genres: ["Sci-Fi", "Science Fiction", "Fantasy"], font: "Orbitron", size: 0.78, track: "0.01em" },
    { id: "sweet", genres: ["Romance", "Musical", "Music"], font: "Playfair Display", size: 0.94, track: "-0.01em", italic: true },
    { id: "sunny", genres: ["Comedy", "Family", "Animation"], font: "Fredoka", size: 0.96, track: "-0.01em" },
  ];

  /* The mood of the last few things you watched, recent ones counting most. */
  function mood() {
    const recent = FL.store.watched().concat(FL.store.continueWatching ? FL.store.continueWatching() : [])
      .sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 5);
    const score = {};
    recent.forEach((e, i) => {
      const film = FL.catalogue.get(e.id);
      const genres = (film && film.genres) || e.genres || [];
      const w = 5 - i;
      MOODS.forEach((m) => { if (genres.some((g) => m.genres.indexOf(g) !== -1)) score[m.id] = (score[m.id] || 0) + w; });
    });
    const best = MOODS.slice().sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0))[0];
    return best && (score[best.id] || 0) >= 4 ? best : null;
  }

  /* Loads just the glyphs the headline needs (Google Fonts subsets with &text=, a few KB). */
  const loaded = new Set();
  function loadFont(m, text) {
    const key = m.font + "|" + text;
    if (loaded.has(key)) return;
    loaded.add(key);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(m.font) + (m.italic ? ":ital@1" : "") +
      "&text=" + encodeURIComponent(Array.from(new Set(text)).join("")) + "&display=swap";
    document.head.appendChild(link);
  }

  /* Attributes for the headline element: a mood class and the font stack (off when motion is calm or disabled). */
  function moodAttrs(text) {
    if ((FL.store.prefs().appearance || {}).moodType === false) return "";
    const m = mood();
    if (!m) return "";
    loadFont(m, text);
    return ' data-mood="' + m.id + '" style="--mood-font:\'' + m.font + '\';--mood-size:' + m.size + ";--mood-track:" + m.track + '"';
  }

  /* ---------- care ---------- */

  const CARE = [
    [60, "An hour in. Sip some water.", "💧"],
    [120, "Two hours! Stretch, blink, breathe.", "🧘"],
    [180, "Three hours… maybe pause for real?", "🌙"],
    [240, "Marathon mode. Your eyes deserve a break.", "👀"],
  ];

  FL.voice = { greeting, signoff, mood, moodAttrs, CARE, MOODS };
})(window.FL = window.FL || {});
