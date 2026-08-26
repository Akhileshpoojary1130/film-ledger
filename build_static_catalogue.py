#!/usr/bin/env python3
"""Build the static film catalogue shipped by movie.html.

The browser never runs this program.  It is a one-time build step that reads
the year-list pages named by the user, enriches exact title pages through the
Wikimedia APIs, joins official IMDb rating data, and writes a plain JavaScript
asset.  Records deliberately remain unrated when the IMDb id or rating is not
available, and future release dates are never written to the app.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "movie-static-catalogue.js"
CACHE = ROOT / ".catalogue-build-cache.json"
CACHE_SCHEMA = 2
TODAY = date(2026, 8, 26)
YEARS = range(1990, 2028)
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
IMDB_RATINGS = "https://datasets.imdbws.com/title.ratings.tsv.gz"
IMDB_BASICS = "https://datasets.imdbws.com/title.basics.tsv.gz"
HEADERS = {
    "User-Agent": "FilmVaultStaticCatalogue/1.0 (offline build; contact: local-app)",
    "Accept": "application/json",
}

# A compact regional collection for the third tab.  These are exact pages for
# films the previous UI promised (including K.G.F. Chapters 1 and 2), not an
# invented "all Indian films" list.  They receive the same source enrichment
# and IMDb join as the Hindi and American year-list records.
REGIONAL_SEEDS = {
    1991: [("Thalapathi", "Thalapathi")], 1992: [("Roja", "Roja (film)")],
    1995: [("Baashha", "Baashha")], 1996: [("Indian", "Indian (1996 film)")],
    1997: [("Iruvar", "Iruvar")], 1998: [("Jeans", "Jeans (1998 film)")],
    1999: [("Sethu", "Sethu (1999 film)")],
    2000: [("Alaipayuthey", "Alaipayuthey"), ("Kandukondain Kandukondain", "Kandukondain Kandukondain")],
    2001: [("Nandha", "Nandha (film)")], 2003: [("Pithamagan", "Pithamagan")],
    2004: [("Virumaandi", "Virumaandi")], 2005: [("Anniyan", "Anniyan")],
    2006: [("Vettaiyaadu Vilaiyaadu", "Vettaiyaadu Vilaiyaadu")],
    2007: [("Paruthiveeran", "Paruthiveeran")], 2008: [("Subramaniapuram", "Subramaniapuram")],
    2010: [("Angadi Theru", "Angadi Theru")], 2012: [("Kahaani", "Kahaani (2012 film)")],
    2013: [("Lucia", "Lucia (2013 film)")],
    2015: [("Baahubali: The Beginning", "Baahubali: The Beginning"), ("Premam", "Premam (2015 film)")],
    2016: [("Sairat", "Sairat"), ("Visaranai", "Visaranai")],
    2017: [("Vikram Vedha", "Vikram Vedha")],
    2018: [("K.G.F: Chapter 1", "KGF: Chapter 1"), ("96", "96 (2018 film)")],
    2019: [("Kumbalangi Nights", "Kumbalangi Nights"), ("Super Deluxe", "Super Deluxe"), ("Asuran", "Asuran"), ("Kaithi", "Kaithi")],
    2020: [("Soorarai Pottru", "Soorarai Pottru")],
    2021: [("The Great Indian Kitchen", "The Great Indian Kitchen"), ("Jai Bhim", "Jai Bhim")],
    2022: [("RRR", "RRR"), ("K.G.F: Chapter 2", "KGF: Chapter 2"), ("Kantara", "Kantara")],
    2023: [("2018", "2018 (film)"), ("Viduthalai Part 1", "Viduthalai Part 1")],
    2024: [("Manjummel Boys", "Manjummel Boys"), ("Aavesham", "Aavesham"), ("Maharaja", "Maharaja (2024 film)"), ("Amaran", "Amaran (2024 film)")],
}


class BuildError(RuntimeError):
    pass


def load_cache() -> dict[str, Any]:
    try:
        cached = json.loads(CACHE.read_text("utf-8"))
        if cached.get("schema") == CACHE_SCHEMA:
            return cached
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return {"schema": CACHE_SCHEMA, "lists": {}, "pages": {}, "entities": {}, "genre_labels": {}}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), "utf-8")


CACHE_DATA = load_cache()
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def get_json(url: str, params: dict[str, Any], attempts: int = 8) -> dict[str, Any]:
    """Respect rate limits: this is a build tool, not a client-side crawler."""
    for attempt in range(attempts):
        try:
            response = SESSION.get(url, params=params, timeout=60)
            if response.status_code in (429, 503):
                time.sleep(min(45, 2 ** min(attempt + 1, 5)))
                continue
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            if attempt == attempts - 1:
                raise BuildError(f"Request failed for {params.get('titles') or params.get('page')}: {exc}") from exc
            time.sleep(min(30, 2 ** attempt))
    raise AssertionError("unreachable")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def strip_citations(value: str) -> str:
    return clean_text(re.sub(r"\[[^\]]+\]", "", value or ""))


def title_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def direct_cells(row: Any) -> list[Any]:
    return row.select(":scope > th, :scope > td")


def table_grid(table: Any) -> list[list[Any]]:
    """Expand colspan/rowspan so every data row keeps the header's columns."""
    active: dict[int, tuple[int, Any]] = {}
    grid: list[list[Any]] = []
    for row in table.select("tr"):
        cells_by_column: dict[int, Any] = {}
        next_active: dict[int, tuple[int, Any]] = {}
        for column, (remaining, cell) in active.items():
            cells_by_column[column] = cell
            if remaining > 1:
                next_active[column] = (remaining - 1, cell)
        column = 0
        for cell in direct_cells(row):
            while column in cells_by_column:
                column += 1
            try:
                colspan = max(1, int(cell.get("colspan", 1)))
                rowspan = max(1, int(cell.get("rowspan", 1)))
            except ValueError:
                colspan, rowspan = 1, 1
            for offset in range(colspan):
                target = column + offset
                cells_by_column[target] = cell
                if rowspan > 1:
                    next_active[target] = (rowspan - 1, cell)
            column += colspan
        grid.append([cells_by_column.get(index) for index in range(max(cells_by_column, default=-1) + 1)])
        active = next_active
    return grid


def list_records(page: str) -> list[dict[str, str]]:
    """Return each title from a year list and retain a listed genre if present."""
    cached = CACHE_DATA["lists"].get(page)
    if cached is not None:
        return cached
    data = get_json(WIKI_API, {"action": "parse", "format": "json", "page": page, "prop": "text"})
    html = data.get("parse", {}).get("text", {}).get("*", "")
    if not html:
        raise BuildError(f"No HTML returned for {page}")
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for table in soup.select("table.wikitable"):
        rows = table_grid(table)
        headers = [clean_text(cell.get_text(" ", strip=True)).lower() if cell else "" for cell in (rows[0] if rows else [])]
        if "title" not in headers:
            continue
        title_index = headers.index("title")
        genre_index = headers.index("genre") if "genre" in headers else None
        for cells in rows[1:]:
            if len(cells) <= title_index:
                continue
            title_cell = cells[title_index]
            if title_cell is None:
                continue
            link = title_cell.find("a", title=True)
            title = clean_text(link.get_text(" ", strip=True) if link else title_cell.get_text(" ", strip=True))
            wiki_title = clean_text(link.get("title") if link else title)
            if not title or len(title) > 150 or re.fullmatch(r"[A-Z ]+", title):
                continue
            # The first column of some release-calendar separator rows is a date;
            # these never have an article target and should not become films.
            if not link and (not re.search(r"[A-Za-z]", title) or title.lower() in {"title", "tba", "to be announced"}):
                continue
            key = title_key(title)
            if not key or key in seen:
                continue
            genre = ""
            if genre_index is not None and len(cells) > genre_index:
                genre = strip_citations(cells[genre_index].get_text(" ", strip=True))
            seen.add(key)
            out.append({"title": title, "wiki": wiki_title, "listedGenre": genre})
    CACHE_DATA["lists"][page] = out
    save_cache(CACHE_DATA)
    return out


def chunked(values: list[Any], size: int) -> list[list[Any]]:
    return [values[offset : offset + size] for offset in range(0, len(values), size)]


def redirected_title(data: dict[str, Any], title: str) -> str:
    for item in data.get("query", {}).get("redirects", []):
        if item.get("from") == title:
            return item.get("to", title)
    return title


def page_metadata(records: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    """Read exact article page data in 30-title batches; no title search fallback."""
    required = {item["wiki"] for item in records}
    missing = [title for title in required if title not in CACHE_DATA["pages"]]
    for batch in chunked(missing, 30):
        data = get_json(
            WIKI_API,
            {
                "action": "query",
                "format": "json",
                "redirects": 1,
                "prop": "pageprops|pageimages|extracts",
                "piprop": "thumbnail",
                "pithumbsize": 600,
                "exintro": 1,
                "explaintext": 1,
                "titles": "|".join(batch),
            },
        )
        pages = data.get("query", {}).get("pages", {})
        for requested in batch:
            resolved = redirected_title(data, requested)
            item = next((candidate for candidate in pages.values() if candidate.get("title") == resolved), {})
            thumb = item.get("thumbnail", {}).get("source", "")
            CACHE_DATA["pages"][requested] = {
                "qid": item.get("pageprops", {}).get("wikibase_item", ""),
                "poster": thumb,
                "description": clean_text(item.get("extract", "")),
            }
        save_cache(CACHE_DATA)
        time.sleep(0.35)
    return {title: CACHE_DATA["pages"].get(title, {}) for title in required}


def wikidata_claims(qids: list[str]) -> dict[str, dict[str, Any]]:
    missing = [qid for qid in set(qids) if qid and qid not in CACHE_DATA["entities"]]
    for batch in chunked(missing, 50):
        data = get_json(
            WIKIDATA_API,
            {"action": "wbgetentities", "format": "json", "props": "claims", "ids": "|".join(batch)},
        )
        CACHE_DATA["entities"].update(data.get("entities", {}))
        save_cache(CACHE_DATA)
        time.sleep(0.25)
    return {qid: CACHE_DATA["entities"].get(qid, {}) for qid in qids if qid}


def claim_string(entity: dict[str, Any], property_name: str) -> str:
    claims = entity.get("claims", {}).get(property_name, [])
    if not claims:
        return ""
    value = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value")
    return value if isinstance(value, str) else ""


def claim_date(entity: dict[str, Any]) -> str:
    claims = entity.get("claims", {}).get("P577", [])
    if not claims:
        return ""
    raw = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("time", "")
    match = re.match(r"^\+(\d{4})-(\d{2})-(\d{2})", raw)
    if not match:
        return ""
    year, month, day = match.groups()
    if month == "00":
        return year
    if day == "00":
        return f"{year}-{month}"
    return f"{year}-{month}-{day}"


def claim_ids(entity: dict[str, Any], property_name: str) -> list[str]:
    ids: list[str] = []
    for claim in entity.get("claims", {}).get(property_name, []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if isinstance(value, dict) and value.get("id"):
            ids.append(value["id"])
    return ids


def genre_labels(ids: list[str]) -> dict[str, str]:
    missing = [qid for qid in set(ids) if qid and qid not in CACHE_DATA["genre_labels"]]
    for batch in chunked(missing, 50):
        data = get_json(
            WIKIDATA_API,
            {"action": "wbgetentities", "format": "json", "props": "labels", "languages": "en", "ids": "|".join(batch)},
        )
        for qid, entity in data.get("entities", {}).items():
            CACHE_DATA["genre_labels"][qid] = entity.get("labels", {}).get("en", {}).get("value", "")
        save_cache(CACHE_DATA)
        time.sleep(0.2)
    return {qid: CACHE_DATA["genre_labels"].get(qid, "") for qid in ids}


def imdb_ratings(imdb_ids: set[str]) -> dict[str, tuple[float, int]]:
    """Join the official IMDb non-commercial ratings TSV by exact P345 id."""
    result: dict[str, tuple[float, int]] = {}
    if not imdb_ids:
        return result
    print("Downloading official IMDb ratings index…", file=sys.stderr)
    response = SESSION.get(IMDB_RATINGS, stream=True, timeout=180)
    response.raise_for_status()
    with gzip.GzipFile(fileobj=response.raw) as stream:
        header = stream.readline().decode("utf-8").rstrip("\n").split("\t")
        try:
            id_index, rating_index, votes_index = header.index("tconst"), header.index("averageRating"), header.index("numVotes")
        except ValueError as exc:
            raise BuildError("IMDb ratings file has an unexpected schema") from exc
        for raw in stream:
            fields = raw.decode("utf-8").rstrip("\n").split("\t")
            if fields[id_index] not in imdb_ids:
                continue
            try:
                result[fields[id_index]] = (float(fields[rating_index]), int(fields[votes_index]))
            except ValueError:
                continue
    return result


def imdb_title_metadata(records: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    """Match only unambiguous IMDb movie titles in their listed source year.

    This avoids the dangerous alternative of fuzzy title matching: a title that
    could refer to two films stays deliberately unrated instead of receiving
    someone else's genre, poster, or score.
    """
    targets: dict[tuple[str, str], list[str]] = {}
    for record in records:
        targets.setdefault((record["year"], title_key(record["title"])), []).append(record["recordKey"])
    source_years = {record["year"] for record in records}
    candidates: dict[str, list[dict[str, str]]] = {}
    print("Downloading IMDb title and genre index…", file=sys.stderr)
    response = SESSION.get(IMDB_BASICS, stream=True, timeout=300)
    response.raise_for_status()
    with gzip.GzipFile(fileobj=response.raw) as stream:
        header = stream.readline().decode("utf-8").rstrip("\n").split("\t")
        fields = {name: header.index(name) for name in ("tconst", "titleType", "primaryTitle", "originalTitle", "startYear", "genres")}
        for raw in stream:
            row = raw.decode("utf-8").rstrip("\n").split("\t")
            if row[fields["titleType"]] != "movie":
                continue
            year = row[fields["startYear"]]
            if not year.isdigit() or year not in source_years:
                continue
            titles = {title_key(row[fields["primaryTitle"]]), title_key(row[fields["originalTitle"]])}
            for normalised_title in titles:
                for record_key in targets.get((year, normalised_title), []):
                    candidates.setdefault(record_key, []).append({
                        "imdbId": row[fields["tconst"]],
                        "genre": row[fields["genres"]].replace(",", " / ") if row[fields["genres"]] != "\\N" else "",
                    })
    # A record is accepted only when the exact normalised title and year led to
    # one IMDb movie.  Duplicate metadata is not trustworthy enough to show.
    return {key: values[0] for key, values in candidates.items() if len({item["imdbId"] for item in values}) == 1}


def source_records() -> dict[str, dict[str, list[dict[str, str]]]]:
    targets = [(str(year), "Hindi", f"List of Hindi films of {year}") for year in YEARS]
    targets += [(str(year), "English", f"List of American films of {year}") for year in YEARS]
    out: dict[str, dict[str, list[dict[str, str]]]] = {str(year): {"Hindi": [], "English": [], "OtherIndian": []} for year in YEARS}
    # One at a time avoids the 429 errors that parallel parsing causes.
    for index, (year, language, page) in enumerate(targets, 1):
        print(f"[{index}/{len(targets)}] {page}", file=sys.stderr)
        out[year][language] = list_records(page)
        time.sleep(0.7)
    for year, seeds in REGIONAL_SEEDS.items():
        out[str(year)]["OtherIndian"] = [{"title": title, "wiki": wiki, "listedGenre": ""} for title, wiki in seeds]
    return out


def build() -> None:
    lists = source_records()
    all_records = []
    for year, languages in lists.items():
        for language, records in languages.items():
            for record in records:
                item = dict(record)
                item["year"] = year
                item["language"] = language
                item["recordKey"] = year + "|" + language + "|" + item["wiki"]
                all_records.append(item)
    print(f"Collected {len(all_records):,} list entries.", file=sys.stderr)
    # A small exact-page cache may contain a verified poster and synopsis from
    # a previous build pass.  Missing posters deliberately use the app's title
    # card rather than a loose image search that could show the wrong film.
    pages = {record["wiki"]: CACHE_DATA["pages"].get(record["wiki"], {}) for record in all_records}
    imdb_metadata = imdb_title_metadata(all_records)
    imdb_ids = {item["imdbId"] for item in imdb_metadata.values()}
    ratings = imdb_ratings(imdb_ids)

    catalogue: dict[str, dict[str, list[list[Any]]]] = {str(year): {"Hindi": [], "English": [], "OtherIndian": []} for year in YEARS}
    for year, languages in lists.items():
        for language, rows in languages.items():
            for row in rows:
                page = pages.get(row["wiki"], {})
                record_key = year + "|" + language + "|" + row["wiki"]
                imdb = imdb_metadata.get(record_key, {})
                # The annual source lists do not all publish precise days.
                # Leave it blank rather than inventing a release date.
                release = ""
                is_future = int(year) >= TODAY.year
                genre = imdb.get("genre", "") or row["listedGenre"]
                if not genre:
                    genre = "Genre not documented" if not is_future else "Unreleased — genre not confirmed"
                imdb_id = imdb.get("imdbId", "")
                rating, votes = ratings.get(imdb_id, (None, None))
                if is_future:
                    release, rating, votes = "", None, None
                # Array fields: title, genre, IMDb score, exact release (if released),
                # exact Wikipedia title, poster URL, source synopsis, votes, IMDb id.
                catalogue[year][language].append([
                    row["title"], genre, rating, release, row["wiki"], page.get("poster", ""),
                    page.get("description", ""), votes, imdb_id,
                ])

    payload = {
        "schema": 1,
        "generated": TODAY.isoformat(),
        "sources": {
            "catalogue": "Wikipedia List of Hindi films / List of American films by year",
            "metadata": "IMDb non-commercial datasets: title.basics.tsv.gz (exact title/year only)",
            "ratings": "IMDb non-commercial datasets: title.ratings.tsv.gz",
        },
        "movies": catalogue,
    }
    js = "/* Generated by build_static_catalogue.py. Do not edit manually. */\n" + "window.FILM_STATIC_CATALOGUE=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUT.write_text(js, "utf-8")
    print(f"Wrote {OUT.name}: {len(all_records):,} records, {OUT.stat().st_size / 1024 / 1024:.1f} MiB", file=sys.stderr)


if __name__ == "__main__":
    try:
        build()
    except BuildError as error:
        print(f"Build failed: {error}", file=sys.stderr)
        raise SystemExit(1)
