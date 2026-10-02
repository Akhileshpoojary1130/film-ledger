# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. **Sakura**, its anime app, lives in
the same place (tap its blossom in the logo to switch). Static site plus a few small functions (Vega and Zoro TV lookups, sync,
where to watch), no account.

Live: https://film-ledger-mocha.vercel.app/

## What it does

- **Home** — one big search bar that docks into the top bar's search as you scroll (on a phone the top bar's search is
  always there, in the middle of the bar or as a round button under Settings — Settings → More — and the tab bar's big
  middle button is **Browse**). The
  headline (**Moodline**) follows the time of day (early bird, lunch — "Had lunch yet?", dinner, late night), changes
  every six hours with different wording each day, and follows what you've been watching: a horror streak gets a
  spooky line in an eerie typeface, comedies a cheerful one. Then **Up Next** — where you stopped (1–3, in Settings;
  the × forgets it, with Undo), then the shows you follow, each with the last episode you ticked — **Tonight's Trio** — three wide artwork cards, one from your taste, one you
  saved, one must-watch, each saying why — **Up next in your series** (KGF 1 → KGF 2, the MCU in order), **For
  you**, *More from* the directors you like, **New episodes** in shows you follow, a daily **Throwback** year, and
  Indian and world discovery rows. The tab bar on phones is icons only.
- **Vega's catalogue** — about 20,000 titles in all: Vega's Hindi dubbed films (Browse → *Hindi dubbed*, and
  *Hindi dubbed, just in* on Home), its web series (Shows → *New web series*), Bollywood, Hollywood, South and Punjabi
  uploads, each with Vega's name, year, language, IMDb rating and genres.
- **Look** — the Iris mark is an aperture that is also an eye: six blades in shades of your accent swirl around a
  pupil with a catchlight; it blinks as you change pages and turns while loading. Backgrounds include **Artwork**: the
  title you're looking at, blurred into a wash of its colours (like Apple TV). Settings run most-used first: Relay,
  Player, Appearance (colour first), Home, Backup.
- **Years** — 1970 (left) to next year (right). Pick the year with a **Dial** (default), **Wheel** (like the iPhone
  camera's mode strip), **Ruler** or **Chips** (Settings → More). Each year merges the bundled vault (from 1990), the
  web's catalogue and Wikipedia's film lists (Hindi, 8 regional languages, American and British) for older years.
  Ordered by **IMDb rating** — well-known titles first, a divider, then few-vote ones — or *Most popular*. Filters:
  language, to-watch / watched / **Must watch**.
- **Must watch** — a tag on films rated 8+ by enough people (or 7.8+ by a huge audience).
- **Watch later** — the bookmark on every poster; it stays visible once saved. Watched films show one tick.
- **Collections** — 300+ in release order: the superhero universes, India's shared universes (the YRF Spy Universe,
  Rohit Shetty's Cop Universe, Maddock's Horror-Comedy Universe, the Lokesh Cinematic Universe), film series from
  **Wikidata** ("part of the
  series": Rocky → Creed III, Jurassic Park → Jurassic World, the Bond films, Dhoom, Housefull, K.G.F…) and, for series
  Wikidata doesn't have, strict title rules: a film joins only as a marked instalment (*Baaghi 2*, *Golmaal Returns*,
  *Phir Hera Pheri*, *Kantara: Chapter 1*) or the one original they follow, so namesakes (Baaghi 1990) and look-alikes
  (*Super 8*, *Apollo 13*) stay out. Wikidata knows few Indian series, so a hand-checked list adds ~70 Hindi and
  regional ones (Munna Bhai, Hera Pheri, Dhamaal, Raaz, 1920, Baahubali, Drishyam in Hindi and Malayalam, Lucifer,
  Timepass…), each shown once two of its films are in the catalogue. A film listed twice (the bundle's copy and a web
  copy under IMDb's longer name) counts once. Films Iris hasn't met yet appear from Wikidata and open like any other.
  On a phone, Collections has a button in the top bar.
- **Shows** — Indian reality & talent (Bigg Boss, India's Got Talent, Lock Upp…), **Indian web series** (Mirzapur,
  Panchayat, The Family Man, Scam 1992, Kota Factory…), popular and reality series worldwide. Seasons and episodes
  are fetched live, so new ones appear on their own. The × on a card in *Your shows* takes it off (with Undo); the
  episodes you've seen stay, and watching it again brings it back.
- **Search** — `⌘K` / `Ctrl K`, tolerant of spellings and typos; anything not bundled is fetched from the web, and
  **On Vega** lists Vega's own uploads Iris doesn't have yet (new and dubbed releases), ready to play.
- **Where to watch** — the film and show pages list the streaming services that carry the title in India, with
  what it costs ("Netflix · Stream", "Apple TV · Rent ₹129"), from JustWatch via `api/where.js`.
- **Film page** — live IMDb score, the **trailer inline** (a still that plays in place), the **full cast** with the
  parts they play (Wikidata adds everyone after Cinemeta's leads), director, writers, music and camera, with photos
  (tap one for their full filmography), the series in order, *More from* the director, similar films, rating, watch
  dates, *Where to watch*. Shows get their full **cast & hosts**: hosts and presenters (Wikidata, TVmaze), the cast,
  creators and the guests named in episode titles ("Guest · S2 E3"). On a phone people sit two or three to a row,
  with *Show all*. A bundled film Cinemeta can't match by title is found
  through its Wikipedia article (Wikipedia → Wikidata → IMDb id), so its details and servers still work.
- **For you** — scored on your taste (genres, languages, decades, the directors of films you loved) and quality,
  with recent watches counting more than old ones (about half after a year and a half); lifted for films closest to
  the ones you rated highest, lowered for ones like those you rated 1–2 or started and left, a little for new
  releases; varied so a row isn't one genre, a little different each day, and each "Because you liked…" is honest
  about which film.
- **Trailer on hover** — rest the mouse on a poster for ~3 seconds and its trailer plays, muted, inside it
  (Settings → More to turn off).
- **Diary** — films you tick appear on the day you ticked them; films you play fill the calendar.
- **Stats** — films, hours, genres, languages, decades, ratings vs IMDb, **faces you watch most**, directors, **time
  of day** and **day of the week** you watch, records.
- **Pause Pals** (break reminders) — on long sittings (anywhere in Iris, not only while watching) a little friend
  drops in at the top right for ten seconds (counted down on the bubble), and acts it out: sit up straight at 25 minutes (it stretches), water at
  45 (it hops), rest your eyes (a slow blink), a stretch, a snack, a proper break at 3 and 4 hours, and a sleepy
  "z z" past midnight. Three episodes in a row and it waves for a break. A cat by default, or a dog, bunny, panda,
  fox, penguin, owl, koala, chick, the Iris mark, or *Mix* for a different one each time (Settings → Home, or Off).
  Tap it to send it away. It shows in Iris's fullscreen player too; Calm motion keeps it still.
- **Movie night** — send a friend a link to your Watch later (Library → Movie night). When they open it, Iris shows
  the films you've both saved (best three first, ready to play), what they want to watch that you don't (one tap on
  the bookmark moves it to the shared list), and what you've already seen. They can send theirs back; recent movie
  nights are remembered. There's a QR code for a friend in the same room.

## Appearance

New visitors start in Material, high-contrast dark with a blue accent, clear glass on a still background, calm
motion, the dial year picker, trailers on hover, the mood headline, three titles in Continue watching and the cat
for break reminders. Everything can be changed, and the **Iris default** preset brings the look back. Settings →
Appearance, in order (Settings opens with your name, then Relay and the app switch):

1. **Style** — Cinema, Material (Android), Cupertino (Apple), Fluent (Windows 11), One UI (Samsung), Glyph
   (dot-matrix, Nothing-style), **Pop** (neo-brutalist: ink outlines, hard shadows, flat colour, buttons that press
   in), **Neon** (night city: glowing edges, magenta-to-cyan) or **Retro** (80s VHS: warm dusk, pixel type,
   scanlines): type, shapes and controls. The active tab's highlight glides between tabs; pages change with a gentle
   zoom from the centre.
2. **Glass & background** — liquid glass (off → clear): frosted, colour-rich panels with a specular rim that catches
   the light at the top left, and on a phone a tab bar that floats as a glass capsule. A background (*Lights*
   far back behind the glass, *Aurora*, or *Artwork*: all dim washes, scattered by a fine frosted grain in the
   glass), and motion (Full: buttons that give under your finger and lean toward the mouse, springy tabs and sheets,
   the headline arriving word by word; Calm: quick fades only). With a mouse or trackpad the page scrolls smoothly
   (Lenis) either way, unless the system asks for reduced motion.
3. **Colour** — dark / light / auto, 13 palettes (the style's own, Noir, AMOLED, High contrast, Graphite, Midnight, Ocean,
   Forest, Sand, Sunset, Rose, Lavender, Nord), any accent colour.

## Where your data lives

In this browser (`localStorage`). Clearing site data erases it, so Settings → Storage offers:

- **Keep a copy on this computer** (Chrome / Edge desktop) — every change is written to a JSON file you pick.
  It survives clearing browser data; put it in iCloud Drive / Google Drive / Dropbox to carry it to other computers.
- **Relay** (Settings → Relay, or `#/move`) — sync: turn it on on one device, scan its code (or open its link) on
  the others, and they stay the same: watched, Watch later, favourites, ratings, shows and episodes, where you stopped
  (start on the laptop, carry on on the phone at the same minute and server) and your settings. Devices pull when Iris
  opens, when you come back to it and every minute while it's on screen, and push a moment after any change. Per
  title the newer edit wins, a removal wins over anything older, and settings merge per section. The library is
  encrypted on the device (AES-GCM, key from the code): the server only stores ciphertext, and anyone without the code
  can't read it. *Turn off here* unlinks one device and keeps its library.
- **One-time copy** (same page) — no internet needed: the library travels inside a QR code (a big one becomes a few
  codes shown in turn) and merges on the other side without deleting anything.
- **Export backup** / **Restore from file** anywhere, and a Letterboxd-compatible CSV.
- The app also asks the browser for persistent storage so it isn't evicted on its own.

Movie-night links, one-time copy codes and sync links carry their data or key after the `#` of the link, which
browsers never send to a server.

**Setting up sync (once, for whoever deploys Iris):** sync keeps each library in this project's own Redis. In Vercel,
open the project → **Storage** → **Create Database** → **Upstash for Redis** (free plan) → **Connect** it to the
project (all environments), then redeploy. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which `api/sync.js`
reads (`UPSTASH_REDIS_REST_URL` / `_TOKEN` and custom prefixes work too). Until then the Sync card says it isn't
switched on, and the one-time copy still works.

## Player

Third-party embed hosts inside an iframe: VidLink, 2Embed, Videasy, VidSrc — and **Vega**, strong on Hindi and
Hindi-dubbed titles.

- **Vega's own players** — Vega lists each title on several hosts of its own (MixDrop, RPM, MultiCloud, Prvs…), with
  links per title rather than by IMDb id. Iris's one server-side piece, `api/vega.js` (a Vercel Edge function), finds
  the title on Vega — by name and year, double-checked against the IMDb id — and those players join the bar after
  *Vega*, next to its *Super* player. Series get the link for that exact episode (Vega's per-episode link, or its
  Ultra Stream player pointed at the episode). A title with no IMDb id can still play from Vega. Links whose page says
  the video is gone are dropped, and Vega's retired Ultra Stream V2 host is skipped. Cached 12 h on Vercel, 6 h in the tab.
- **Starts fast** — the film or show page checks the servers, looks the title up on Vega and opens a connection to the
  likeliest server while you read, so Play loads a server straight away.
- **Checked from your network** — hosts are probed (9 s, one retry) and unreachable ones skipped. "Unreachable" is
  usually your internet provider or an ad blocker blocking that host.
- **Skips "not found" by itself** — VidLink and Videasy report player events as soon as a title loads; when they only
  send pings, they're showing their "couldn't find this" page. Vega's Super Player says so outright. Either way Iris
  moves to the next server with a toast.
- **Remembers what works** — a server is remembered (per language) only after it actually played, or after you stayed
  on it for five minutes.
- **Series** play by season and episode, with *Next episode*. Progress feeds *Continue watching*, resume and
  auto-logging; films finished in the player are logged, episodes ticked.
- Some hosts open an ad pop-up on the first click inside their player; the second click plays.
- On a phone held upright every server is in view, in rows (Vega's on their own line), with a full-width *Next server*.
- **Next server** goes to the best-ranked server not tried yet for this title, then rounds the list. Hindi and Indian
  titles start on Vega (its Super Player is what Vega's own site uses) until your own history says otherwise.
- **Fullscreen** takes the whole player, not just the video's frame, so break reminders and toasts still show; the
  bars fade after a few still seconds and come back at the top or bottom edge. A video site's own fullscreen button
  hands over to Iris's fullscreen; where the browser doesn't allow that, Up Next, reminders and toasts still show
  over the site's fullscreen (the browser's top layer). On a phone it turns to landscape, and
  a tap along the top or bottom edge brings the bars back.
- **Episodes Vega has first** — a new episode Vega already carries shows up before Cinemeta lists it ("Out now on
  Vega") and starts on Vega's players; bonus episodes and extra footage (*Bonus 1*, *Bonus 2*…) play there too.
- Titles no server carries (many Indian reality shows) have *Where to watch*. Keys: `N` next server, `1`–`9` pick,
  `F` fullscreen, `Esc` close.
- **Download** — when Vega or Vega Hot (vega-hot.com) has download pages for a title, the player's top bar and the
  film page get a *Download* list, labelled by quality, codec and size ("720p x265 HEVC · 780MB"); an episode gets that
  episode's pages and whole-season packs; a show page has a download button on each episode and a *Season* pack
  link. Each opens in a new tab; the host's own steps, including its "are you
  human" check, happen there. Iris doesn't go around that check.
- **Clear Play** (Settings → Player) — Vega's Super Player and HubStream play in a sandboxed frame, so they can't
  open ad tabs or redirect. The other hosts refuse to play sandboxed (2Embed says "Sandbox not allowed"), so for them
  Iris asks "Leave site?" if the player tries to send the page elsewhere. MixDrop (adult ads) is tried last; for Indian series and shows
  2Embed and Videasy lead, since VidLink often has the wrong show.
- **Up Next** in the player — at an episode's credits the next one is announced with a 10-second countdown (Play now
  / Cancel); Settings → Player → Autoplay next episode turns it off.

## Sakura — anime

Two apps in one: **Iris** for films and web series, **Sakura** for anime. The logo is the switch: a capsule with
both marks, the current one named; tap the other mark and the capsule morphs over to it (Settings → App works too).
Each app returns to where you were in it, and each device opens the one you used last. Sakura
keeps Iris's design and adds its own colour (cherry-blossom pink), its own mark (a five-petal blossom built like the
aperture, with the same pupil and catchlight; it blinks and turns the same way), bars and search. One library for
both, so Relay syncs your anime too; Iris's lists and stats leave anime out.

- **Home** — Up Next (where you stopped, else the next episode that's out), **Spotlight** (the week's most talked
  about, as wide artwork cards), **For you** (AniList's community recommendations for the anime you've liked,
  added up: "Because you liked Frieren"), **Just out** (the newest episodes on Zoro TV), **Collections**, **This season** with each show's
  countdown to its next episode, Trending, Plan to watch, Coming next season, genres, All-time favourites, Top rated
  and Films.
- **Seasons** (Winter / Spring / Summer / Fall of any year, TV / films / ONA), **Explore** (by genre; popular, top
  rated, trending or newest; TV or films), **A–Z** (Zoro TV's list of about 900 series, by letter and type) and
  **Library** (Watching, Plan to watch, Completed, Favourites).
- **A title** — its banner, English, romaji and Japanese names, AniList score, the next episode's countdown, trailer,
  characters with their Japanese voices, every episode with its name and still (in hundreds for long runs like One
  Piece), episodes and ranges to tick, its **collection** (the whole franchise in release order),
  More like this, your rating, and links to AniList, MyAnimeList and Zoro TV. A title from Zoro TV opens its AniList
  page when AniList has it.
- **Collections** — a franchise's every series, film, OVA and special in release order (All / Series / Films /
  Extras), from AniList's links: up from a title to its main story, along that story's sequels and prequels, then each
  entry's side stories, films, recaps and spin-offs (with their own sequels, but no further side links, so a crossover
  like *Lupin III vs. Detective Conan* belongs to Conan without pulling in all of Lupin III). Live, so new sequels
  appear by themselves; kept a week. **Collections** (Sakura's top bar) lists yours and the popular franchises.
- **Player** — MegaPlay (by AniList id; it reports playback, so resume, auto-ticking and Up Next work), **Zoro**
  (Zoro TV's own player for the episode) and Videasy, with a **Sub / Dub** switch that's remembered. All three refuse
  to play sandboxed, so they run behind the "Leave site?" guard.
- **Where it comes from** — AniList's public API (all of Home in one request, answers cached; it allows about 30
  requests a minute) and Zoro TV through `api/anime.js`. `node tools/build-zoro.mjs` refreshes the A–Z list.

## Found on search

`index.html` carries a description, Open Graph / Twitter cards (`assets/og.png`), structured data, a web manifest
with icons (installable), `robots.txt` and `sitemap.xml`. Submit the sitemap in Google Search Console to get it indexed.

## If it won't start

If a script is blocked (ad/tracker blockers, flaky connections, very old browsers) the loader is replaced by a
message naming what didn't load, with *Reload* and *Clear cached artwork & reload* — your library and settings are
kept. A page that fails on its own shows an error in place instead of taking the app down.

## Keyboard

`⌘K` / `/` search · `R` surprise me · `G` then `H` home, `Y` years, `B` browse, `T` shows, `L` library, `D` diary,
`S` stats · on Years `←` `→` change year · on a film `P` play, `T` trailer, `W` watchlist, `M` watched, `F` favourite ·
`?` all shortcuts.

## Structure

```
index.html            shell, boot loader, early theme
movie.html            redirect for old links
api/vega.js           Vercel Edge function: finds a title on Vega and returns its player and download links
api/sync.js           Vercel Edge function: keeps each synced library (ciphertext) in the project's Upstash Redis
api/where.js          Vercel Edge function: streaming services for a title in India (JustWatch)
api/anime.js          Vercel Edge function: Zoro TV's search, newest episodes, a series' episodes and each episode's players
tests/                unit tests (node --test), live server check, in-browser page sweep
tools/build-series.mjs  builds data/series.js from Wikidata (about a minute)
tools/build-vega.mjs  builds data/vega.js: Vega's catalogue (Hindi dubbed, web series, Bollywood, Hollywood, South,
                      Punjabi) trimmed to what the bundle lacks, gently, one page at a time (about ten minutes)
tools/build-zoro.mjs  builds data/zoro.js: Zoro TV's A–Z list, gently (about a minute)
data/zoro.js          Zoro TV's ~900 series (name, type, episodes, poster), loaded only in Sakura
data/vega.js          ~3,600 films and ~680 web series from Vega, and "Hindi dubbed" marks for 1,700 bundled films;
                      loaded after the first screen, so start-up isn't slower
data/catalogue.js     the bundled vault (window.FILM_STATIC_CATALOGUE, schema 2)
data/series.js        film series from Wikidata (window.FILM_SERIES) — regenerate with node tools/build-series.mjs
assets/app.css        one token system; theme × mode blocks at the top
assets/js/
  util.js             helpers, safe storage, fetch with timeout, limiter
  catalogue.js        normalisation, search + autocorrect, browse, series detection, recommendations
  store.js            library, episodes, prefs, recent searches, migration, backup
  theme.js            styles, palettes, glass, motion, accents, the aperture mark and Sakura's blossom
  voice.js            time-of-day lines, mood typefaces
  ambient.js          Lights (canvas) and Aurora backgrounds
  meta.js             IMDb resolution, Cinemeta details, poster chain
  remote.js           web titles: search, year catalogues, Wikipedia year lists, shows & episodes
  people.js           cast & crew portraits (Wikipedia, Wikidata), full credits from Wikidata, filmographies, favourite people
  persist.js          File System Access backup file
  ui.js               icons, cards, rails, rating, reveal & tilt motion, toasts, modals
  share.js            packing, QR codes (qrcode-generator), camera scanner (BarcodeDetector / jsQR), share links
  sync.js             sync: encryption, merging (newer wins, removals remembered), when to pull and push
  anime.js            Sakura's data: AniList (cached, one request at a time), Zoro TV, episodes, title matching
  player.js           theatre player, server choice (fixed hosts + Vega's per-title links; anime hosts, Sub / Dub), auto-logging
  pet.js              Pause Pals: break reminders, the companions and their moves, the sitting timer
  palette.js          ⌘K palette, surprise me, settings, shortcuts
  views/              home, years (dial), browse, film, shows, person, library + collections + diary, insights (stats),
                      together (Sync, one-time copy and Movie night), anime (Sakura's pages, search and the app switch)
  app.js              router, chrome, page transitions
  motion.js           smooth scrolling (Lenis, from jsDelivr), magnetic buttons, the headline word by word
```

## Run

Any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Vercel serves the repo root as-is — no build step — and runs `api/` as functions.
A local static server has no `/api`, so a copy on localhost asks the deployed functions for Vega's and Zoro TV's links.

## Tests

```bash
node --test tests/*.test.mjs
```

Unit tests for the Vega lookup (reading Vega's titles, matching names written differently — K.G.F / KGF — search
spellings, episode labels, link clean-up, dead-link detection, download buttons), the sync store (setup detection,
revisions, two devices writing at once, against an in-memory Redis), Zoro TV's pages (cards, sub and dub players,
episode lists, newest episodes) and the icon font subset. No network.

```bash
node tests/servers.mjs
```

A live check from your network: each fixed server, Vega's Super Player for a few films, and Vega's own players for a
film and two episodes via the live `/api/vega` (pass another site as an argument, e.g. `http://localhost:8000`). One
request per host, so it's light enough to run whenever playback seems off.

`tests/smoke.js` checks every page in the browser: open Iris, paste it into the console (or
`await import("/tests/smoke.js")`), and it visits each route and reports errors, broken pages and anything wider than
the screen.
