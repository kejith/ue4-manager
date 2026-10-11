"""UE4 Manager: stdlib-only, self-hosted, read-only Empire Universe dashboard."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
DATABASE = Path(os.environ.get('DATABASE_PATH', '/data/ue4-manager.sqlite3'))
API_BASE = os.environ.get('EU4_API_BASE', 'https://www.empire-universe.com/api/v1').rstrip('/')
CORE = ('/me', '/me/planets', '/me/fleets', '/me/tasks', '/me/research', '/me/commanders', '/me/pa', '/me/vision', '/me/relations')
REFERENCE = ('/reference', '/reference/ships', '/reference/modules', '/reference/buildings', '/reference/research', '/reference/constants')
ENDPOINTS = CORE + REFERENCE
MAX_REQUESTS = 50  # conservative local budget; upstream usage elsewhere is unknown
WINDOW = 24 * 3600
LOCK = threading.RLock()
REFRESH_LOCK = threading.Lock()
SESSION_KEY = os.environ.get('SESSION_SECRET', '').encode() or secrets.token_bytes(32)
PASSWORD = os.environ.get('DASHBOARD_PASSWORD', '')
TOKEN = os.environ.get('EU4_API_TOKEN', '')
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', 'true').lower() != 'false'
SESSION_LIFETIME = 12 * 3600
LOGIN_FAILURES = {}  # address -> failed-attempt timestamps; bounded and pruned
LOGIN_WINDOW = 15 * 60
LOGIN_MAX_FAILURES = 8
LOG = logging.getLogger('ue4-manager')


def connect():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA busy_timeout=15000')
    return conn


def init_db():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
            CREATE TABLE IF NOT EXISTS latest (
              endpoint TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              endpoint TEXT NOT NULL, updated_at INTEGER NOT NULL, body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_history_path ON history(endpoint, updated_at DESC);
            CREATE TABLE IF NOT EXISTS requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              created_at INTEGER NOT NULL, endpoint TEXT NOT NULL,
              status INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')


def now():
    return int(time.time())


def read_setting(name, default=''):
    with connect() as db:
        r = db.execute('SELECT value FROM settings WHERE key=?', (name,)).fetchone()
        return r['value'] if r else default


def write_setting(name, value):
    with connect() as db:
        db.execute('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (name, str(value)))


def usage():
    with connect() as db:
        db.execute('DELETE FROM requests WHERE created_at < ?', (now() - WINDOW,))
        r = db.execute('SELECT COUNT(*) AS n FROM requests').fetchone()
        oldest = db.execute('SELECT MIN(created_at) AS first FROM requests').fetchone()['first']
    reset = (oldest + WINDOW) if oldest else None
    return {'used': r['n'], 'limit': MAX_REQUESTS, 'remaining': max(0, MAX_REQUESTS - r['n']), 'nextSlotAt': reset,
            'blockedUntil': int(read_setting('blocked_until', '0'))}


def reserve_request(path):
    with LOCK:
        status = usage()
        if status['remaining'] <= 0:
            raise SyncError('The local 50 requests / 24 hours safety budget is exhausted.', 429)
        if status['blockedUntil'] > now():
            raise SyncError('The upstream API rate limit is active.', 429)
        with connect() as db:
            cursor = db.execute('INSERT INTO requests(created_at,endpoint,status) VALUES(?,?,?)', (now(), path, 0))
            return cursor.lastrowid


def finish_request(request_id, status):
    with connect() as db:
        db.execute('UPDATE requests SET status=? WHERE id=?', (status, request_id))


class SyncError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def fetch_endpoint(path):
    if path not in ENDPOINTS:
        raise SyncError('Endpoint is not allowlisted.', 400)
    if not TOKEN:
        raise SyncError('EU4_API_TOKEN is not configured.', 503)
    request_id = reserve_request(path)
    status = 0
    try:
        request = Request(API_BASE + path,
                          headers={'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/json',
                                   'User-Agent': 'UE4-Manager/1.0'}, method='GET')
        with urlopen(request, timeout=20) as response:
            status = response.status
            raw = response.read(4_000_001)
            if len(raw) > 4_000_000:
                raise SyncError('Upstream payload exceeds 4 MB safety limit.')
            payload = json.loads(raw)
            timestamp = now()
            body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False)
            with connect() as db:
                db.execute('INSERT INTO latest(endpoint,updated_at,body) VALUES(?,?,?) '
                           'ON CONFLICT(endpoint) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body',
                           (path, timestamp, body))
                db.execute('INSERT INTO history(endpoint,updated_at,body) VALUES(?,?,?)', (path, timestamp, body))
                db.execute('DELETE FROM history WHERE endpoint=? AND id NOT IN '
                           '(SELECT id FROM history WHERE endpoint=? ORDER BY id DESC LIMIT 180)', (path, path))
            return {'path': path, 'ok': True, 'updatedAt': timestamp}
    except HTTPError as exc:
        status = exc.code
        if exc.code == 429:
            retry = exc.headers.get('Retry-After', '3600')
            try:
                delay = min(86400, max(60, int(retry)))
            except ValueError:
                delay = 3600
            write_setting('blocked_until', now() + delay)
        if exc.code in (401, 403):
            raise SyncError(f'Game API rejected credentials or scope (HTTP {exc.code}).', exc.code) from exc
        raise SyncError(f'Game API HTTP {exc.code}.', exc.code) from exc
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        raise SyncError('Could not retrieve a valid JSON response from the game API.') from exc
    finally:
        finish_request(request_id, status)


def sync(paths):
    if not REFRESH_LOCK.acquire(blocking=False):
        raise SyncError('Another refresh is already running.', 409)
    try:
        # Sequential on purpose: avoid concurrently over-committing the strict upstream rate limit.
        results = []
        for path in paths:
            try:
                results.append(fetch_endpoint(path))
            except SyncError as exc:
                results.append({'path': path, 'ok': False, 'status': exc.status, 'error': str(exc)})
                if exc.status == 429:
                    break
        return results
    finally:
        REFRESH_LOCK.release()


def current():
    with connect() as db:
        rows = db.execute('SELECT endpoint,updated_at,body FROM latest').fetchall()
    return {row['endpoint']: {'updatedAt': row['updated_at'], 'data': json.loads(row['body'])} for row in rows}


def make_session():
    exp = now() + SESSION_LIFETIME
    data = f'{exp}.{secrets.token_hex(12)}'
    digest = hmac.new(SESSION_KEY, data.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f'{data}.{digest}'.encode()).decode().rstrip('=')


def valid_session(cookie_header):
    if not cookie_header:
        return False
    try:
        parsed = SimpleCookie()
        parsed.load(cookie_header)
        token = parsed['ue4_session'].value
        value = base64.urlsafe_b64decode(token + '=' * (-len(token) % 4)).decode()
        expiry, nonce, digest = value.split('.')
        expected = hmac.new(SESSION_KEY, f'{expiry}.{nonce}'.encode(), hashlib.sha256).hexdigest()
        return int(expiry) > now() and hmac.compare_digest(expected, digest)
    except (KeyError, ValueError, UnicodeError, base64.binascii.Error):
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = 'UE4Manager/1.0'

    def log_message(self, fmt, *args):
        # Do not log secrets / cookie headers / POST bodies.
        LOG.info('%s %s', self.address_string(), fmt % args)

    def headers_common(self, content_type, length, code=200, extra=None):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(length))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()

    def json_response(self, data, code=200, extra=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.headers_common('application/json; charset=utf-8', len(body), code, extra)
        self.wfile.write(body)

    def get_body(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise SyncError('Invalid Content-Length.', 400)
        if not (0 < length <= 32768):
            raise SyncError('Request body must be at most 32 KB.', 413)
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise SyncError('JSON content type required.', 415)
        try:
            obj = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise SyncError('Invalid JSON.', 400)
        if not isinstance(obj, dict):
            raise SyncError('Expected JSON object.', 400)
        return obj

    def authenticated(self):
        return bool(PASSWORD) and valid_session(self.headers.get('Cookie'))

    def same_origin(self):
        origin = self.headers.get('Origin')
        if not origin:
            # Browsers send Origin for JS POSTs; reject to prevent cross-site requests.
            return False
        candidate = urlsplit(origin)
        requested_host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host', '')
        return candidate.netloc.lower() == requested_host.lower() and candidate.scheme in ('http', 'https')

    def require_auth(self):
        if not self.authenticated():
            self.json_response({'error': 'Authentication required.'}, 401)
            return False
        return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/healthz':
            return self.json_response({'ok': True})
        if path in ('/', '/app.js', '/styles.css', '/favicon.svg'):
            name = {'/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg'}[path]
            types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}
            body = (WEB / name).read_bytes()
            self.headers_common(types[Path(name).suffix] + '; charset=utf-8', len(body))
            return self.wfile.write(body)
        if not path.startswith('/api/'):
            return self.json_response({'error': 'Not found.'}, 404)
        if not self.require_auth():
            return
        if path == '/api/status':
            cached = current()
            return self.json_response({'configured': bool(TOKEN), 'usage': usage(),
                                       'endpoints': list(ENDPOINTS), 'core': list(CORE), 'reference': list(REFERENCE),
                                       'cache': {k: v['updatedAt'] for k, v in cached.items()}})
        if path == '/api/snapshot':
            return self.json_response({'endpoints': current()})
        if path == '/api/history':
            with connect() as db:
                rows = db.execute('SELECT endpoint,updated_at,body FROM history WHERE endpoint IN '
                                  '(\'/me/planets\',\'/me/fleets\',\'/me/tasks\') '
                                  'ORDER BY updated_at DESC,id DESC LIMIT 540').fetchall()
            return self.json_response({'snapshots': [{'path': r['endpoint'], 'at': r['updated_at'],
                                                      'data': json.loads(r['body'])} for r in reversed(rows)]})
        return self.json_response({'error': 'Not found.'}, 404)

    def do_POST(self):
        path = urlsplit(self.path).path
        if not path.startswith('/api/') and not path.startswith('/auth/'):
            return self.json_response({'error': 'Not found.'}, 404)
        if not self.same_origin():
            return self.json_response({'error': 'Invalid Origin header.'}, 403)
        if path == '/auth/login':
            if not PASSWORD:
                return self.json_response({'error': 'DASHBOARD_PASSWORD is not configured.'}, 503)
            try:
                body = self.get_body()
            except SyncError as exc:
                return self.json_response({'error': str(exc)}, exc.status)
            address = self.client_address[0]
            with LOCK:
                failures = [t for t in LOGIN_FAILURES.get(address, []) if t >= now() - LOGIN_WINDOW]
                LOGIN_FAILURES[address] = failures
                if len(failures) >= LOGIN_MAX_FAILURES:
                    return self.json_response({'error': 'Too many failed login attempts. Try again later.'}, 429)
            submitted = body.get('password', '')
            # Cap length to protect from trivially costly requests.
            valid = isinstance(submitted, str) and len(submitted) < 4096 and hmac.compare_digest(submitted.encode(), PASSWORD.encode())
            if not valid:
                with LOCK:
                    LOGIN_FAILURES.setdefault(address, []).append(now())
                time.sleep(0.12)
                return self.json_response({'error': 'Incorrect password.'}, 401)
            with LOCK:
                LOGIN_FAILURES.pop(address, None)
            attrs = f'Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_LIFETIME}'
            if COOKIE_SECURE:
                attrs += '; Secure'
            return self.json_response({'ok': True}, extra={'Set-Cookie': f'ue4_session={make_session()}; {attrs}'})
        if not self.require_auth():
            return
        if path == '/auth/logout':
            return self.json_response({'ok': True}, extra={'Set-Cookie': 'ue4_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})
        if path == '/api/refresh':
            try:
                body = self.get_body()
                scope = body.get('scope', 'core')
                if scope == 'core':
                    paths = CORE
                elif scope == 'reference':
                    paths = REFERENCE
                elif scope == 'all':
                    paths = ENDPOINTS
                elif scope == 'selected' and isinstance(body.get('paths'), list):
                    paths = tuple(dict.fromkeys(body['paths']))
                    if not paths or any(not isinstance(x, str) or x not in ENDPOINTS for x in paths):
                        raise SyncError('Invalid endpoint selection.', 400)
                else:
                    raise SyncError('Invalid refresh scope.', 400)
                if not TOKEN:
                    raise SyncError('EU4_API_TOKEN is not configured.', 503)
                return self.json_response({'results': sync(paths), 'usage': usage()})
            except SyncError as exc:
                return self.json_response({'error': str(exc)}, exc.status)
        return self.json_response({'error': 'Not found.'}, 404)


def main():
    logging.basicConfig(level=os.environ.get('LOG_LEVEL', 'INFO'), format='%(asctime)s %(levelname)s %(message)s')
    if not PASSWORD:
        raise SystemExit('DASHBOARD_PASSWORD is required. Set it in your deployment environment.')
    if len(PASSWORD) < 12:
        raise SystemExit('DASHBOARD_PASSWORD must contain at least 12 characters.')
    if len(SESSION_KEY) < 32:
        raise SystemExit('SESSION_SECRET must contain at least 32 characters.')
    if not COOKIE_SECURE:
        LOG.warning('COOKIE_SECURE=false; use only on local HTTP development.')
    init_db()
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '8080'))
    server = ThreadingHTTPServer((host, port), Handler)
    LOG.info('UE4 Manager listening on %s:%s', host, port)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
