#!/usr/bin/env python3
"""
Film Ledger Local Server & Live Streaming API Proxy
===================================================
Runs a local server at http://localhost:8888 that serves movie.html
and proxies NetMirror, VegaMovies, and Cinemeta IMDb resolver.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.parse
import json
import re
from html import unescape
import os
import sys

PORT = 8888

# In-memory IMDb ID cache for fast lookups
IMDB_CACHE = {
    'deadpool & wolverine': 'tt6263850',
    'deadpool and wolverine': 'tt6263850',
    'avengers: endgame': 'tt4154796',
    'avengers endgame': 'tt4154796',
    'spider-man: no way home': 'tt10872600',
    'spider man no way home': 'tt10872600',
    'chhichhore': 'tt9052870',
    'udaan': 'tt1639426',
    'sholay': 'tt0073707',
    'border': 'tt0118751',
    'border 2': 'tt30387012',
    'fighter': 'tt14589574',
    'stree 2': 'tt27510174',
    'kalki 2898 ad': 'tt12735488',
    'jawan': 'tt15354916',
    'pathaan': 'tt12844910',
    'animal': 'tt13751694',
    'dangal': 'tt5074352',
    '3 idiots': 'tt1187043',
    'the batman ii': 'tt20247656',
    'the odyssey': 'tt3569782',
    'avengers: doomsday': 'tt21344706',
    'raja shivaji': 'tt31268305',
    'ramayana': 'tt32039237',
    'dhurandhar': 'tt32819875',
    'alpha': 'tt32799988'
}

class FilmLedgerHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Referer')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. Resolve IMDb ID from title
        if parsed.path.startswith('/api/resolve_imdb'):
            params = urllib.parse.parse_qs(parsed.query)
            query = params.get('q', [''])[0].strip()
            self.handle_resolve_imdb(query)
            return

        # 2. Proxy VegaMovies live search
        if parsed.path.startswith('/api/vegamovies/search'):
            params = urllib.parse.parse_qs(parsed.query)
            query = params.get('q', [''])[0].strip()
            self.handle_vegamovies_search(query)
            return

        # 3. Proxy VegaMovies movie details & direct download links
        if parsed.path.startswith('/api/vegamovies/detail'):
            params = urllib.parse.parse_qs(parsed.query)
            page_url = params.get('url', [''])[0].strip()
            self.handle_vegamovies_detail(page_url)
            return

        # 4. Proxy NetMirror live search
        if parsed.path.startswith('/api/search2/'):
            query = parsed.path.replace('/api/search2/', '')
            target_url = f'https://api2.imdb4.shop/api/search2/{query}?{parsed.query}'
            self.forward_api_request(target_url, referer='https://netmirror.center/')
            return
            
        # 5. Proxy NetMirror movie detail
        if parsed.path.startswith('/api/movie/'):
            movie_id = parsed.path.replace('/api/movie/', '')
            target_url = f'https://api2.imdb3.shop/api/movie/{movie_id}'
            self.forward_api_request(target_url, referer='https://netmirror.center/')
            return

        # Default: serve static files (movie.html, movie-static-catalogue.js)
        if self.path == '/':
            self.path = '/movie.html'
        return super().do_GET()

    def handle_resolve_imdb(self, query):
        if not query:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'imdb_id': ''}).encode('utf-8'))
            return

        q_clean = query.lower().strip()
        if q_clean in IMDB_CACHE:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'imdb_id': IMDB_CACHE[q_clean], 'source': 'cache'}).encode('utf-8'))
            return

        # Query Cinemeta catalog
        try:
            url = f'https://v3-cinemeta.strem.io/catalog/movie/top/search={urllib.parse.quote(query)}.json'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = json.loads(urllib.request.urlopen(req, timeout=3).read().decode('utf-8'))
            metas = data.get('metas', [])
            if metas:
                top = metas[0]
                imdb_id = top.get('imdb_id') or top.get('id') or ''
                if imdb_id.startswith('tt'):
                    IMDB_CACHE[q_clean] = imdb_id
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'imdb_id': imdb_id, 'title': top.get('name'), 'source': 'cinemeta'}).encode('utf-8'))
                    return
        except Exception:
            pass

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'imdb_id': ''}).encode('utf-8'))

    def forward_api_request(self, target_url, referer='https://netmirror.center/'):
        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': referer
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            err_json = json.dumps({'error': str(e), 'results': []}).encode('utf-8')
            self.wfile.write(err_json)

    def handle_vegamovies_search(self, query):
        if not query:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'results': []}).encode('utf-8'))
            return

        try:
            url = 'https://vega-mia.com/'
            data = urllib.parse.urlencode({'do': 'search', 'subaction': 'search', 'story': query}).encode('utf-8')
            headers = {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://vega-mia.com',
                'referer': 'https://vega-mia.com/',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            req = urllib.request.Request(url, data=data, headers=headers)
            html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8')
            posts = re.findall(r'<article[^>]*>([\s\S]*?)</article>', html)
            results = []
            for p in posts:
                link_match = re.search(r'<a href=\"(https://vega-mia\.com/[^\"]+\.html)\"', p)
                title_match = re.search(r'<a[^>]+>(?:<h2[^>]*>)?([^<]+)(?:</h2>)?</a>', p) or re.search(r'alt=\"([^\"]+)\"', p)
                img_match = re.search(r'<img[^>]+src=\"([^\"]+)\"', p)
                if link_match and title_match:
                    img_url = img_match.group(1) if img_match else ''
                    if img_url and not img_url.startswith('http'):
                        img_url = 'https://vega-mia.com' + img_url
                    results.append({
                        'title': unescape(title_match.group(1).strip()),
                        'url': link_match.group(1),
                        'poster': img_url,
                        'source': 'VegaMovies'
                    })
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'results': results}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'results': [], 'error': str(e)}).encode('utf-8'))

    def handle_vegamovies_detail(self, page_url):
        if not page_url:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing url'}).encode('utf-8'))
            return

        try:
            headers = {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'referer': 'https://vega-mia.com/',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            req = urllib.request.Request(page_url, headers=headers)
            html = urllib.request.urlopen(req, timeout=8).read().decode('utf-8')
            
            title_m = re.search(r'<h1[^>]*>([^<]+)</h1>', html) or re.search(r'<title>([^<]+)</title>', html)
            title = title_m.group(1).strip() if title_m else 'VegaMovies Download'
            
            # Extract IMDb ID if present in player config (e.g. src: 'tt6263850')
            imdb_m = re.search(r'src:\s*[\'\"](tt\d+)[\'\"]', html)
            imdb_id = imdb_m.group(1) if imdb_m else ''

            buttons = re.findall(r'<a[^>]+href=[\"\']([^\"\']+)[\"\'][^>]*>([\s\S]*?)</a>', html)
            links = []
            seen = set()
            for href, text in buttons:
                clean_text = re.sub(r'<[^>]+>', '', text).strip()
                if not href.startswith('http'):
                    continue
                if any(bad in href for bad in ['vega-mia.com/category', 'vega-mia.com/bollywood', 'vega-mia.com/hollywood', 'vega-mia.com/dual-audio', 'vega-mia.com/telugu']):
                    continue
                if any(w in clean_text for w in ['Download', 'DOWNLOAD', 'V-Cloud', 'Fast', 'Direct', '1080p', '720p', '480p', '4K', '2160p', 'HEVC']):
                    if href not in seen:
                        seen.add(href)
                        links.append({'label': clean_text, 'url': href})
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'title': title, 'imdb_id': imdb_id, 'links': links, 'page_url': page_url}).encode('utf-8'))
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'links': [], 'error': str(e)}).encode('utf-8'))

def run():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('127.0.0.1', PORT), FilmLedgerHandler)
    print(f"🎬 Film Ledger Server running at http://localhost:{PORT}/")
    print(f"📡 API Proxies active: IMDb Resolver (/api/resolve_imdb), VegaMovies (/api/vegamovies/), NetMirror (/api/search2/)")
    print(f"Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == '__main__':
    run()
