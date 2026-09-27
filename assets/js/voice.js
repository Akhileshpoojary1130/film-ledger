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
    late: [["Still up?", "Let's make it a short one."], ["The late show", "starts whenever you say."], ["Can't sleep?", "A comfort film might help."], ["Midnight screening,", "just for you."], ["Night owl hours.", "Pick something gentle."], ["Quiet house.", "Perfect for a loud film."], ["Everyone's asleep.", "The screen's all yours."], ["One more episode?", "We won't tell."]],
    dawn: [["Up before the sun?", "Start with something gentle."], ["Early start.", "Room for a short one?"], ["First light,", "first frame."], ["Chai's brewing.", "So is the reel."], ["Birds are up.", "So are you."]],
    morning: [["Good morning.", "What's on the reel today?"], ["Coffee first,", "classics after."], ["Fresh day,", "fresh film."], ["Slow morning?", "Line up something for tonight."], ["Rise and shine.", "The credits can roll later."], ["Weekend plans?", "Start the watchlist now."], ["Morning chai,", "evening cinema."]],
    lunch: [["Had lunch yet?", "Grab a bite, then a film."], ["How was lunch?", "Here's dessert."], ["Lunch break?", "Something under two hours."], ["Eat first.", "The film will wait."], ["Lunch sorted?", "Let's find a side of cinema."], ["Thali done?", "Time for a short one."]],
    afternoon: [["Lazy afternoon?", "Perfect matinee weather."], ["It's matinee time.", "What are we watching?"], ["Tea's ready.", "Now for a good story."], ["Post-lunch slump?", "Something lively, then."], ["Sip some water,", "then pick a film."], ["Afternoon matinee,", "anyone?"], ["Rainy outside?", "Cosy inside."]],
    evening: [["Evening's here.", "What's the mood?"], ["Done for the day?", "Put your feet up."], ["Golden hour,", "golden films."], ["Long day?", "Let a story carry you."], ["Samosa and a screen?", "Say no more."], ["Work's done.", "Showtime."]],
    dinner: [["Dinner done?", "Pick something for after."], ["Dinner and a movie.", "The classic pairing."], ["Plates down,", "lights down."], ["Food's ready,", "and so is the screen."], ["Family's gathering?", "Find one everyone likes."]],
    night: [["What are we", "watching tonight?"], ["Lights down,", "screen up."], ["Tonight's feature", "is your call."], ["One more before bed?", "Make it a good one."], ["Settle in.", "This one's worth staying up for."], ["Blanket on?", "Press play."]],
  };

  /* Lines in the key of what you've been watching (the mood below): a horror streak gets a spooky welcome, a run of
     comedies a cheerful one. They take turns with the time-of-day lines. */
  const MOOD_LINES = {
    eerie: [["Lights off?", "Something's waiting in the dark."], ["Brave tonight?", "Watch through your fingers."], ["Creaky floors, cold spots.", "Perfect horror weather."],
      ["Don't look behind you.", "Look at these instead."], ["Scared yet?", "Let's fix that."], ["Heard that noise?", "Probably nothing. Probably."]],
    tense: [["Trust no one.", "Especially the narrator."], ["Case open.", "Who did it tonight?"], ["Edge of your seat?", "We've got just the thing."],
      ["Plot twists ahead.", "Mind the gap."], ["Every clue matters.", "Pay attention."]],
    bold: [["Ready for a ride?", "Buckle up."], ["Something loud tonight?", "Turn it up."], ["Slow-motion walk?", "Pick your hero."],
      ["Big screen energy.", "Let's go."], ["Mass entry time.", "Whistles ready?"]],
    future: [["Another world tonight?", "The portal's open."], ["Space, time or dragons?", "Your pick."], ["Beam me somewhere.", "Anywhere but here."],
      ["Reality's overrated.", "Try a new one."]],
    sweet: [["In the mood for love?", "Hearts on screen tonight."], ["A little romance?", "Keep the tissues close."], ["Butterflies wanted.", "Here's a start."],
      ["Old songs, new love?", "Press play."], ["Feeling filmy?", "Let's go full Bollywood."]],
    sunny: [["Need a laugh?", "We've got you."], ["Long day?", "Let's make it funnier."], ["Belly laughs only.", "Pick one."],
      ["Something light tonight?", "Easy watching ahead."], ["Life's too short", "for boring films."]],
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
    // Every other six-hour block (on the whole), the line follows your mood instead of the clock.
    const m = moodOn() ? mood() : null;
    const d = new Date();
    const useMood = m && MOOD_LINES[m.id] && hash(d.toDateString() + "|" + Math.floor(d.getHours() / 6) + "|mood") % 2 === 0;
    return { id, eyebrow: hello + (name ? ", " + name : ""), line: useMood ? pick(MOOD_LINES[m.id], "m" + m.id) : pick(LINES[id], id) };
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

  /* Loads just the glyphs the headline needs (Google Fonts subsets with &text=, a few KB). Both cases: some styles set
     the headline in capitals, and a glyph missing from the subset falls back to another font mid-word. */
  const loaded = new Set();
  function loadFont(m, text) {
    const key = m.font + "|" + text;
    if (loaded.has(key)) return;
    loaded.add(key);
    const glyphs = Array.from(new Set(text + text.toUpperCase() + text.toLowerCase())).sort().join("");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(m.font) + (m.italic ? ":ital@1" : "") +
      "&text=" + encodeURIComponent(glyphs) + "&display=swap";
    document.head.appendChild(link);
  }

  const moodOn = () => (FL.store.prefs().appearance || {}).moodType !== false;

  /* Attributes for the headline element: a mood class and the font stack (off when motion is calm or disabled). */
  function moodAttrs(text) {
    if (!moodOn()) return "";
    const m = mood();
    if (!m) return "";
    loadFont(m, text);
    return ' data-mood="' + m.id + '" style="--mood-font:\'' + m.font + '\';--mood-size:' + m.size + ";--mood-track:" + m.track + '"';
  }

  FL.voice = { greeting, signoff, mood, moodAttrs, MOODS };
})(window.FL = window.FL || {});
