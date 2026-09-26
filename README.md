# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. Static site, no backend, no account.

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
- **Collections** — 140+ in release order: the superhero universes plus film series found by title (Harry Potter,
  Pirates of the Caribbean, Mission: Impossible, Dhoom, Golmaal, Bhool Bhulaiyaa, KGF, Pushpa, Kantara…).
- **Shows** — Indian reality & talent (Bigg Boss, India's Got Talent, Lock Upp…), **Indian web series** (Mirzapur,
  Panchayat, The Family Man, Scam 1992, Kota Factory…), popular and reality series worldwide. Seasons and episodes
  are fetched live, so new ones appear on their own.
- **Search** — `⌘K` / `Ctrl K`, tolerant of spellings and typos; anything not bundled is fetched from the web.
- **Film page** — live IMDb score, the **trailer inline** (a still that plays in place), cast & crew with small photos
  (tap one for their full filmography, from Wikidata), the series in order, *More from* the director, similar films,
  rating, watch dates, *Where to watch*.
- **Trailer on hover** — rest the mouse on a poster for ~3 seconds and its trailer plays, muted, inside it
  (Settings → More to turn off).
- **Diary** — films you tick appear on the day you ticked them; films you play fill the calendar.
- **Stats** — films, hours, genres, languages, decades, ratings vs IMDb, **faces you watch most**, directors, **time
  of day** and **day of the week** you watch, records.
- **Care** — during long sessions a small Iris character peeks in at the top right for five seconds: water after an
  hour, a stretch after two, and a nudge if it's very late.
- **Movie night** — send a friend a link to your Watch later (Library → Movie night). When they open it, Iris shows
  the films you've both saved (best three first, ready to play), what they want to watch that you don't (one tap on
  the bookmark moves it to the shared list), and what you've already seen. They can send theirs back; recent movie
  nights are remembered. There's a QR code for a friend in the same room.

## Appearance

New visitors start in Cupertino, high-contrast dark, clear glass over a slow aurora, calm motion. Settings →
Appearance, in order:

1. **Style** — Cinema, Material (Android), Cupertino (Apple), Fluent (Windows 11), One UI (Samsung) or Glyph
   (dot-matrix, Nothing-style): type, shapes and controls.
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
send to a server. Syncing automatically would need a server; this stays serverless on purpose.

## Player

Third-party embed hosts inside an iframe (VidLink, 2Embed, Vega, Videasy, VidSrc).

- **Checked from your network** — hosts are probed (9 s, one retry) and unreachable ones skipped. "Unreachable" is
  usually your internet provider or an ad blocker blocking that host.
- **Skips "not found" by itself** — VidLink and Videasy report player events as soon as a title loads; when they only
  send pings, they're showing their "couldn't find this" page, and Iris moves to the next server with a toast.
- **Remembers what works** — a server is remembered (per language) only after it actually played, or after you stayed
  on it for five minutes.
- **Series** play by season and episode, with *Next episode*. Progress feeds *Continue watching*, resume and
  auto-logging; films finished in the player are logged, episodes ticked.
- Some hosts open an ad pop-up on the first click inside their player; the second click plays.
- Titles no server carries (many Indian reality shows) have *Where to watch*. Keys: `N` next server, `1`–`5` pick,
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
data/catalogue.js     the bundled vault (window.FILM_STATIC_CATALOGUE, schema 2)
assets/app.css        one token system; theme × mode blocks at the top
assets/js/
  util.js             helpers, safe storage, fetch with timeout, limiter
  catalogue.js        normalisation, search + autocorrect, browse, series detection, recommendations
  store.js            library, episodes, prefs, recent searches, migration, backup
  theme.js            styles, palettes, glass, motion, accents, the aperture mark
  voice.js            time-of-day lines, mood typefaces, care messages
  ambient.js          Lights (canvas) and Aurora backgrounds
  meta.js             IMDb resolution, Cinemeta details, poster chain
  remote.js           web titles: search, year catalogues, Wikipedia year lists, shows & episodes
  people.js           cast & crew portraits (Wikipedia), filmographies, favourite people
  persist.js          File System Access backup file
  ui.js               icons, cards, rails, rating, reveal & tilt motion, toasts, modals
  share.js            packing, QR codes (qrcode-generator), camera scanner (BarcodeDetector / jsQR), share links
  player.js           theatre player, auto-logging
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

Open http://localhost:8000. Vercel serves the repo root as-is — no build step.
