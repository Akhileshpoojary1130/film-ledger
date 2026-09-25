# Iris

A film and TV diary: go through cinema **year by year** (1970 → next year), tick off what you've seen, follow
reality and talent shows episode by episode, and get told what to watch next. Static site, no backend, no account.

Live: https://film-ledger-mocha.vercel.app/

## What it does

- **Home** — *Continue watching*, a *Tonight* pick, **Up next in your series** (watched KGF 1 → KGF 2; Hera Pheri →
  Phir Hera Pheri), **For you** (from what you rated, favourited and rewatched, with the reason shown), your shows,
  watchlist, and the year's big releases.
- **Years** — every year from 1970 to next year. Each year merges the bundled vault (15,600 films), the web's
  catalogue for that year (loaded as you scroll) and Wikipedia's Hindi / Tamil / Telugu / Malayalam / Kannada film
  lists for older years. *Most popular* interleaves each language's hits, so a year shows Jaws and Sholay together.
  Filter by language and watched / to-watch; the year strip shows how much of each year you've seen.
- **Shows** — Indian reality & talent (Bigg Boss, India's Got Talent, Lock Upp, Khatron Ke Khiladi, Indian Idol,
  Shark Tank India, KBC…), popular series and reality TV worldwide. Seasons and episodes are fetched live, so a new
  season shows up on its own when it airs. Tick episodes or whole seasons; reality shows open on the current season.
- **Search** — `⌘K` from anywhere. Ranked across the vault in a few ms, tolerant of Hinglish spellings, acronyms and
  typos (`gangs of wasepur` → *Gangs of Wasseypur*, "Showing results for…"). Anything the vault doesn't have is
  fetched from the web and appears exactly like a bundled title. Recent searches are kept.
- **Film page** — backdrop, runtime, cast, trailer, IMDb score, the whole series in release order, similar films,
  star rating, watch dates. Links to IMDb, Wikipedia and *Where to watch* (JustWatch).
- **Library, Diary, Stats** — watchlist, watched, shows, favourites, collections; a calendar of viewing days; films,
  hours, genres, languages, decades, streaks and how your ratings compare with IMDb.
- **Less typing** — rating is stars only. Films log themselves: when the stream reports the end (or you've watched
  most of the runtime), it's marked watched and leaves your watchlist.

## Appearance

Settings → Appearance: **Cinema** (editorial serif, near-black), **Material** (Android / Material You: tonal
surfaces, pill buttons, Material Symbols) or **macOS** (SF type, vibrancy, segmented controls) — each in dark, light
or follow-system, with eight accents or any custom colour. The aperture logo is the loader everywhere; the app opens
with an iris-out, pages cross-fade and the poster you click glides into the film page (View Transitions).

## Where your data lives

In this browser (`localStorage`). Clearing site data erases it, so Settings → Storage offers:

- **Keep a copy on this computer** (Chrome / Edge desktop) — every change is written to a JSON file you pick.
  It survives clearing browser data; put it in iCloud Drive / Google Drive / Dropbox to carry it to other computers.
- **Export backup** / **Restore from file** anywhere, and a Letterboxd-compatible CSV.
- The app also asks the browser for persistent storage so it isn't evicted on its own.

Syncing between devices automatically would need a server; this stays serverless on purpose.

## Player

Third-party embed hosts inside an iframe (VidLink, 2Embed, Vega, Videasy, VidSrc). Hosts are probed from your
network and unreachable ones are skipped; the host that actually played is remembered per language; VidLink and
Videasy report progress for *Continue watching*, resume and auto-logging. Series play by season and episode with a
*Next episode* button. Some titles (many Indian reality shows) aren't on these hosts — *Where to watch* links to the
official service. Keys: `N` next server, `1`–`5` pick, `F` fullscreen, `Esc` close.

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
  theme.js            themes, accents, the aperture mark
  meta.js             IMDb resolution, Cinemeta details, poster chain
  remote.js           web titles: search, year catalogues, Wikipedia year lists, shows & episodes
  persist.js          File System Access backup file
  ui.js               icons, cards, rails, rating, reveal & tilt motion, toasts, modals
  player.js           theatre player, auto-logging
  palette.js          ⌘K palette, surprise me, settings, shortcuts
  views/              home, years, browse, film, shows, library + diary, stats
  app.js              router, chrome, page transitions
```

## Run

Any static server:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Vercel serves the repo root as-is — no build step.
