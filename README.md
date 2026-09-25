# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. Static site, no backend, no account.

Live: https://film-ledger-mocha.vercel.app/

## What it does

- **Home** — *Continue watching*, a *Tonight* pick, **Up next in your series** (watched KGF 1 → KGF 2; Hera Pheri →
  Phir Hera Pheri), **For you** (from what you rated, favourited and rewatched, with the reason shown), your shows,
  watchlist, and the year's big releases.
- **Years** — a camera-style dial from 1970 (left) to next year (right): scroll over it, drag, swipe or tap a
  year and it snaps into the centre; the films change in place. Each year merges the bundled vault (15,600 films),
  the web's catalogue for that year and Wikipedia's Hindi / Tamil / Telugu / Malayalam / Kannada lists for older
  years. The default order is **IMDb rating, high to low** — well-known titles first, then ones with few votes (a
  divider marks the switch) — or *Most popular*, which interleaves each language's hits. Ratings are the live IMDb
  figures; titles missing one are looked up in the background.
- **Shows** — Indian reality & talent (Bigg Boss, India's Got Talent, Lock Upp, Khatron Ke Khiladi, Indian Idol,
  Shark Tank India, KBC…), popular series and reality TV worldwide. Seasons and episodes are fetched live, so a new
  season shows up on its own when it airs. Tick episodes or whole seasons; reality shows open on the current season.
- **Search** — `⌘K` from anywhere. Ranked across the vault in a few ms, tolerant of Hinglish spellings, acronyms and
  typos (`gangs of wasepur` → *Gangs of Wasseypur*, "Showing results for…"). Anything the vault doesn't have is
  fetched from the web and appears exactly like a bundled title. Recent searches are kept.
- **Film page** — backdrop, runtime, trailer, live IMDb score, **cast & crew with small portraits** (Wikipedia),
  the whole series in release order, *More from* the director, similar films, star rating, watch dates. Links to
  IMDb, Wikipedia and *Where to watch* (JustWatch).
- **People** — tap anyone for their page: portrait, who they are, everything they directed, acted in or wrote, and
  how many you've seen. Home adds *More from Rajkumar Hirani* / *More with Pankaj Tripathi* rails for the people
  behind what you watch and rate highly.
- **Library, Diary, Stats** — watchlist, watched, shows, favourites, collections; a calendar of viewing days; films,
  hours, genres, languages, decades, streaks and how your ratings compare with IMDb.
- **Continue watching** — Home shows up to three unfinished titles (1–3 in Settings → Home).
- **Less typing** — rating is stars only. Films log themselves: when the stream reports the end (or you've watched
  most of the runtime), it's marked watched and leaves your watchlist.

## Appearance

Settings → Appearance mixes four independent choices, or one-tap *Quick looks*:

- **Style** — Cinema (editorial serif), Material (Android / Material You, Material Symbols) or Cupertino (SF, rounded).
- **Palette** — 28, each with a dark and light version generated in OKLCH: Noir, AMOLED, High contrast, Midnight,
  Ocean, Lagoon, Forest, Sand, Marigold, Sunset, Crimson, Sakura, Grape, Nord, Dracula, Tokyo Night, Catppuccin,
  Gruvbox, Solarized and more; plus mode (dark / light / auto) and any accent colour.
- **Liquid glass** — off, subtle, balanced or clear: frosted, see-through bars, panels and sheets.
- **Background** — *Lights*: soft lamps drift behind frosted glass, bright and defined when near, dim and scattered
  when far, bumping gently off each other; *Aurora*: slow colour ribbons. Both pause in background tabs.
- **Motion** — Full or Calm (no tilt, drift or page effects; also follows the system's reduce-motion setting).

The aperture logo is the loader, blinks its shutter as you change pages, and the app opens with an iris-out.

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
  ambient.js          Lights (canvas) and Aurora backgrounds
  meta.js             IMDb resolution, Cinemeta details, poster chain
  remote.js           web titles: search, year catalogues, Wikipedia year lists, shows & episodes
  people.js           cast & crew portraits (Wikipedia), filmographies, favourite people
  persist.js          File System Access backup file
  ui.js               icons, cards, rails, rating, reveal & tilt motion, toasts, modals
  player.js           theatre player, auto-logging
  palette.js          ⌘K palette, surprise me, settings, shortcuts
  views/              home, years (dial), browse, film, shows, person, library + diary, insights (stats)
  app.js              router, chrome, page transitions
```

## Run

Any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Vercel serves the repo root as-is — no build step.
