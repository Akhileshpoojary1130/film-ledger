# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. Static site, no backend, no account.

Live: https://film-ledger-mocha.vercel.app/

## What it does

- **Home** — a big logo that docks into the top bar as you scroll, and one search bar that does the same. The
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
- **Film page** — live IMDb score, cast & crew with small photos (tap one for all their films), the series in order,
  *More from* the director, similar films, rating, watch dates, *Where to watch*.
- **Diary** — films you tick appear on the day you ticked them; films you play fill the calendar.
- **Stats** — films, hours, genres, languages, decades, ratings vs IMDb, **faces you watch most**, directors, **time
  of day** and **day of the week** you watch, records.
- **Care** — during long sessions a small Iris character peeks in at the top right for five seconds: water after an
  hour, a stretch after two, and a nudge if it's very late.

## Appearance

Settings → Appearance, in order:

1. **Style** — Cinema, Material (Android), Cupertino (Apple), Fluent (Windows 11), One UI (Samsung) or Glyph
   (dot-matrix, Nothing-style): type, shapes and controls.
2. **Glass & background** — liquid glass (off → clear), a background (*Lights* drifting dimly behind frosted glass,
   or *Aurora*), and motion (Full / Calm).
3. **Colour** — dark / light / auto, 44 palettes (scroll the strip), any accent colour.

## Where your data lives

In this browser (`localStorage`). Clearing site data erases it, so Settings → Storage offers:

- **Keep a copy on this computer** (Chrome / Edge desktop) — every change is written to a JSON file you pick.
  It survives clearing browser data; put it in iCloud Drive / Google Drive / Dropbox to carry it to other computers.
- **Export backup** / **Restore from file** anywhere, and a Letterboxd-compatible CSV.
- The app also asks the browser for persistent storage so it isn't evicted on its own.

Syncing between devices automatically would need a server; this stays serverless on purpose.

## Player

Third-party embed hosts inside an iframe (VidLink, 2Embed, Vega, Videasy, VidSrc). Hosts are probed from your
network (9 s, one retry — slow isn't down) and unreachable ones are skipped. "Unreachable" is usually your internet
provider or an ad blocker blocking that host, which the app can't change; the host that actually played is remembered per language; VidLink and
Videasy report progress for *Continue watching*, resume and auto-logging. Series play by season and episode with a
*Next episode* button. Some titles (many Indian reality shows) aren't on these hosts — *Where to watch* links to the
official service. Keys: `N` next server, `1`–`5` pick, `F` fullscreen, `Esc` close.

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
  player.js           theatre player, auto-logging
  palette.js          ⌘K palette, surprise me, settings, shortcuts
  views/              home, years (dial), browse, film, shows, person, library + collections + diary, insights (stats)
  app.js              router, chrome, page transitions
```

## Run

Any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Vercel serves the repo root as-is — no build step.
