# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. Static site plus one
small function (Vega lookups), no account.

Live: https://film-ledger-mocha.vercel.app/

## What it does

- **Home** — one big search bar that docks into the top bar's search as you scroll. The
  headline follows the time of day (early bird, lunch — "Had lunch yet?", dinner, late night), changes every six hours
  with different wording each day, and takes a typeface from what you've been watching (eerie for horror, bold for
  action, sunny for comedy). Then *Continue watching* (1–3, in Settings), **three picks** — one from your taste, one
  you saved, one must-watch — each saying why, **Up next in your series** (KGF 1 → KGF 2, the MCU in order), **For
  you**, *More from* the directors you like, **New episodes** in shows you follow, a daily **Throwback** year, and
  Indian and world discovery rows.
- **Years** — 1970 (left) to next year (right). Pick the year with a **Dial** (default), **Wheel** (like the iPhone
  camera's mode strip), **Ruler** or **Chips** (Settings → More). Each year merges the bundled vault (from 1990), the
  web's catalogue and Wikipedia's film lists (Hindi, 8 regional languages, American and British) for older years.
  Ordered by **IMDb rating** — well-known titles first, a divider, then few-vote ones — or *Most popular*. Filters:
  language, to-watch / watched / **Must watch**.
- **Must watch** — a tag on films rated 8+ by enough people (or 7.8+ by a huge audience).
- **Watch later** — the bookmark on every poster; it stays visible once saved. Watched films show one tick.
- **Collections** — 300+ in release order: the superhero universes, film series from **Wikidata** ("part of the
  series": Rocky → Creed III, Jurassic Park → Jurassic World, the Bond films, Dhoom, Housefull, K.G.F…) and, for series
  Wikidata doesn't have, strict title rules: a film joins only as a marked instalment (*Baaghi 2*, *Golmaal Returns*,
  *Phir Hera Pheri*, *Kantara: Chapter 1*) or the one original they follow, so namesakes (Baaghi 1990) and look-alikes
  (*Super 8*, *Apollo 13*) stay out. Films Iris hasn't met yet appear from Wikidata and open like any other.
- **Shows** — Indian reality & talent (Bigg Boss, India's Got Talent, Lock Upp…), **Indian web series** (Mirzapur,
  Panchayat, The Family Man, Scam 1992, Kota Factory…), popular and reality series worldwide. Seasons and episodes
  are fetched live, so new ones appear on their own.
- **Search** — `⌘K` / `Ctrl K`, tolerant of spellings and typos; anything not bundled is fetched from the web, and
  **On Vega** lists Vega's own uploads Iris doesn't have yet (new and dubbed releases), ready to play.
- **Film page** — live IMDb score, the **trailer inline** (a still that plays in place), the **full cast** with the
  parts they play (Wikidata adds everyone after Cinemeta's leads), director, writers, music and camera, with photos
  (tap one for their full filmography), the series in order, *More from* the director, similar films, rating, watch
  dates, *Where to watch*. Shows get their full cast too.
- **For you** — scored on your taste (genres, languages, decades) and quality, lifted for films closest to the ones
  you rated highest, lowered for ones like those you rated 1–2, a little for new releases; varied so a row isn't one
  genre, and each "Because you liked…" is honest about which film.
- **Trailer on hover** — rest the mouse on a poster for ~3 seconds and its trailer plays, muted, inside it
  (Settings → More to turn off).
- **Diary** — films you tick appear on the day you ticked them; films you play fill the calendar.
- **Stats** — films, hours, genres, languages, decades, ratings vs IMDb, **faces you watch most**, directors, **time
  of day** and **day of the week** you watch, records.
- **Break reminders** — on long sittings (anywhere in Iris, not only while watching) a little friend drops in at the
  top right for five seconds: water at 45 minutes, a stretch at 1½ hours, rest your eyes, and a nudge if it's past
  midnight. A cat by default, or a dog, or the Iris aperture (Settings → Home, or Off). Tap it to send it away.
- **Movie night** — send a friend a link to your Watch later (Library → Movie night). When they open it, Iris shows
  the films you've both saved (best three first, ready to play), what they want to watch that you don't (one tap on
  the bookmark moves it to the shared list), and what you've already seen. They can send theirs back; recent movie
  nights are remembered. There's a QR code for a friend in the same room.

## Appearance

New visitors start in Cupertino, high-contrast dark, clear glass over a slow aurora, calm motion. Settings →
Appearance, in order:

1. **Style** — Cinema, Material (Android), Cupertino (Apple), Fluent (Windows 11), One UI (Samsung), Glyph
   (dot-matrix, Nothing-style) or **Pop** (neo-brutalist: ink outlines, hard shadows, flat colour, buttons that press
   in): type, shapes and controls. The active tab's highlight glides between tabs.
2. **Glass & background** — liquid glass (off → clear), a background (*Lights* drifting dimly behind frosted glass,
   or *Aurora*), and motion (Full / Calm).
3. **Colour** — dark / light / auto, 44 palettes (scroll the strip), any accent colour.

## Where your data lives

In this browser (`localStorage`). Clearing site data erases it, so Settings → Storage offers:

- **Keep a copy on this computer** (Chrome / Edge desktop) — every change is written to a JSON file you pick.
  It survives clearing browser data; put it in iCloud Drive / Google Drive / Dropbox to carry it to other computers.
- **Phone ↔ laptop** (Settings → Storage → Move library, or `#/move`) — one device shows a QR code, Iris on the other
  scans it. A big library becomes a few codes shown in turn; the scanner collects them in any order. It merges
  (watched, Watch later, ratings, shows, where you stopped) and never deletes. Each code is also a link, so a phone's
  own camera app can open it.
- **Export backup** / **Restore from file** anywhere, and a Letterboxd-compatible CSV.
- The app also asks the browser for persistent storage so it isn't evicted on its own.

Movie-night links and moving codes carry the data inside the code or after the `#` of the link, which browsers never
send to a server. Syncing automatically would need a server; your library stays in the browser on purpose.

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
- Titles no server carries (many Indian reality shows) have *Where to watch*. Keys: `N` next server, `1`–`9` pick,
  `F` fullscreen, `Esc` close.

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
api/vega.js           Vercel Edge function: finds a title on Vega and returns its player links
tests/                unit tests (node --test), live server check, in-browser page sweep
tools/build-series.mjs  builds data/series.js from Wikidata (about a minute)
data/catalogue.js     the bundled vault (window.FILM_STATIC_CATALOGUE, schema 2)
data/series.js        film series from Wikidata (window.FILM_SERIES) — regenerate with node tools/build-series.mjs
assets/app.css        one token system; theme × mode blocks at the top
assets/js/
  util.js             helpers, safe storage, fetch with timeout, limiter
  catalogue.js        normalisation, search + autocorrect, browse, series detection, recommendations
  store.js            library, episodes, prefs, recent searches, migration, backup
  theme.js            styles, palettes, glass, motion, accents, the aperture mark
  voice.js            time-of-day lines, mood typefaces
  ambient.js          Lights (canvas) and Aurora backgrounds
  meta.js             IMDb resolution, Cinemeta details, poster chain
  remote.js           web titles: search, year catalogues, Wikipedia year lists, shows & episodes
  people.js           cast & crew portraits (Wikipedia, Wikidata), full credits from Wikidata, filmographies, favourite people
  persist.js          File System Access backup file
  ui.js               icons, cards, rails, rating, reveal & tilt motion, toasts, modals
  share.js            packing, QR codes (qrcode-generator), camera scanner (BarcodeDetector / jsQR), share links
  player.js           theatre player, server choice (fixed hosts + Vega's per-title links), auto-logging
  pet.js              break reminders: the cat / dog / Iris companion and the sitting timer
  palette.js          ⌘K palette, surprise me, settings, shortcuts
  views/              home, years (dial), browse, film, shows, person, library + collections + diary, insights (stats),
                      together (Move and Movie night)
  app.js              router, chrome, page transitions
```

## Run

Any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Vercel serves the repo root as-is — no build step — and runs `api/` as functions.
A local static server has no `/api`, so a copy on localhost asks the deployed function for Vega's links.

## Tests

```bash
node --test tests/*.test.mjs
```

Unit tests for the Vega lookup: reading Vega's titles, matching names written differently (K.G.F / KGF), search
spellings, episode labels, link clean-up and dead-link detection. No network.

```bash
node tests/servers.mjs
```

A live check from your network: each fixed server, Vega's Super Player for a few films, and Vega's own players for a
film and two episodes via the live `/api/vega` (pass another site as an argument, e.g. `http://localhost:8000`). One
request per host, so it's light enough to run whenever playback seems off.

`tests/smoke.js` checks every page in the browser: open Iris, paste it into the console (or
`await import("/tests/smoke.js")`), and it visits each route and reports errors, broken pages and anything wider than
the screen.
