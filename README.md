# 🎬 Film Ledger — Universal Cinema Suite & Live Embedded Streams

A client-side cinema application containing an offline archive of **15,800+ films** (Hindi, English, Regional Indian & Marvel/DC Universe) spanning from **1978 to 2027**, featuring **6 embedded streaming servers**, client-side IMDb resolution, and responsive mobile/desktop UI.

---

## ✨ Features

- 🏛️ **15,800+ Movie Archive**: Hindi Cinema, English Cinema, Other Indian Cinema, and Marvel & DC Universe spanning 50 years (1978–2027).
- 📱 **Mobile-First Responsive UI**: Netflix-style 2-column mobile poster gallery, touch-optimized swiping, and native bottom-sheet player modal.
- 🎬 **6 Embedded Streaming Servers**:
  - 🚀 **Server 1**: Videasy HD (`player.videasy.net`)
  - ⚡ **Server 2**: VidLink Pro (`vidlink.pro`)
  - 🎬 **Server 3**: 2Embed Cinema (`2embed.cc`)
  - 🌐 **Server 4**: VidSrc Ultra (`vidsrc.me`)
  - 📺 **Server 5**: SmashyStream (`smashy.stream`)
  - ⚡ **Server 6**: VegaMovies Official Player (`slast430did.com`)
- 🔍 **Dynamic Client-Side IMDb Resolver**: Resolves real IMDb IDs dynamically (e.g. *Deadpool & Wolverine* → `tt6263850`) directly in browser JS without needing any backend server.
- 🖼️ **Dynamic Wikipedia Posters**: Fetches poster artwork and plot extracts dynamically over public Wikipedia APIs.
- ⚡ **100% Standalone**: All data and logic are bundled in a single self-contained file (`index.html` / `movie.html`).

---

## 🚀 Instant Deployment

### Host on Vercel
1. Fork or push this repository to your GitHub account (`https://github.com/Akhileshpoojary1130/film-ledger`).
2. Go to [Vercel](https://vercel.com/) → Click **Add New Project**.
3. Import the `film-ledger` repository.
4. Click **Deploy** (no build command needed — it is pure static HTML/JS/CSS).

### Run Locally
Simply open `index.html` or `movie.html` in any browser:
```bash
open index.html
```

Or start the optional Python development proxy server:
```bash
python3 server.py
```
Open [http://localhost:8888](http://localhost:8888).
