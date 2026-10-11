"""Integration tests: local HTTP server and stubbed upstream (no real API calls)."""
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from app import server


class FakeAPI:
    def __init__(self, body, status=200, headers=None):
        self.body = json.dumps(body).encode()
        self.status = status
        self.headers = headers or {}
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self, length=-1):
        return self.body[:length]


class IntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DATABASE
        self.old_password = server.PASSWORD
        self.old_token = server.TOKEN
        self.old_secure = server.COOKIE_SECURE
        self.old_session = server.SESSION_KEY
        server.DATABASE = Path(self.temp.name) / 'test.sqlite3'
        server.PASSWORD = 'sufficiently-long-test-password'
        server.TOKEN = 'private-test-token'
        server.SESSION_KEY = b'unit-test-only-session-signing-key'
        server.COOKIE_SECURE = False
        server.init_db()
        server.LOGIN_FAILURES.clear()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.host = f'127.0.0.1:{self.http.server_address[1]}'
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=2)
        server.DATABASE = self.old_db
        server.PASSWORD = self.old_password
        server.TOKEN = self.old_token
        server.COOKIE_SECURE = self.old_secure
        server.SESSION_KEY = self.old_session
        self.temp.cleanup()

    def req(self, path, method='GET', data=None, cookie=None, origin=True):
        headers = {}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        if origin:
            headers['Origin'] = 'http://' + self.host
        if cookie:
            headers['Cookie'] = cookie
        request = Request('http://' + self.host + path, method=method, headers=headers,
                          data=json.dumps(data).encode() if data is not None else None)
        try:
            with urlopen(request, timeout=5) as response:
                raw = response.read()
                return response.status, dict(response.headers), json.loads(raw) if raw else None
        except HTTPError as ex:
            return ex.code, dict(ex.headers), json.loads(ex.read())

    def login(self):
        status, headers, body = self.req('/auth/login', 'POST', {'password': server.PASSWORD})
        self.assertEqual(200, status)
        self.assertNotIn('private-test-token', str(body))
        return headers['Set-Cookie'].split(';')[0]

    def test_requires_authentication(self):
        status, _, body = self.req('/api/snapshot')
        self.assertEqual(status, 401)
        self.assertIn('error', body)
        self.assertEqual(self.req('/healthz')[0], 200)

    def test_login_security(self):
        self.assertEqual(self.req('/auth/login', 'POST', {'password': 'incorrect-long-password'})[0], 401)
        self.assertEqual(self.req('/auth/login', 'POST', {'password': server.PASSWORD},origin=False)[0], 403)
        cookie = self.login()
        status, _, payload = self.req('/api/status', cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(len(payload['endpoints']), 15)
        self.assertEqual(payload['usage']['remaining'], 50)
        self.assertEqual(self.req('/api/status', cookie=cookie+'corrupted')[0], 401)

    def test_login_rate_limited_after_failed_attempts(self):
        for _ in range(server.LOGIN_MAX_FAILURES):
            self.assertEqual(self.req('/auth/login', 'POST', {'password': 'invalid'})[0], 401)
        status, _, body = self.req('/auth/login', 'POST', {'password': server.PASSWORD})
        self.assertEqual(status, 429)
        self.assertIn('Too many', body['error'])

    def test_sync_cache_history_and_quota(self):
        cookie = self.login()
        def upstream(req, timeout=20):
            self.assertEqual(req.get_header('Authorization'), 'Bearer private-test-token')
            return FakeAPI({'planets': [{'id': 1, 'name': 'Test planet', 'resources': {'ore': 1200}}]})
        with patch.object(server, 'urlopen', side_effect=upstream):
            status, _, data = self.req('/api/refresh','POST',{'scope':'selected','paths':['/me/planets']},cookie)
        self.assertEqual(status, 200)
        self.assertEqual(len(data['results']), 1)
        self.assertTrue(data['results'][0]['ok'])
        self.assertEqual(data['usage']['remaining'], 49)
        _, _, data = self.req('/api/snapshot',cookie=cookie)
        self.assertEqual(data['endpoints']['/me/planets']['data']['planets'][0]['resources']['ore'], 1200)
        _, _, data = self.req('/api/history',cookie=cookie)
        self.assertEqual(len(data['snapshots']), 1)
        self.assertEqual(self.req('/api/refresh','POST',{'scope':'selected','paths':['/me/logs']},cookie)[0], 400)
        self.assertEqual(self.req('/api/status',cookie=cookie)[2]['usage']['remaining'], 49)

    def test_upstream_limit_prevents_more_calls(self):
        cookie = self.login()
        with server.connect() as db:
            db.executemany('INSERT INTO requests(created_at,endpoint,status) VALUES(?,?,200)',
                           [(server.now(), '/me')] * 50)
        with patch.object(server, 'urlopen') as upstream:
            _, _, result = self.req('/api/refresh','POST',{'scope':'selected','paths':['/me']},cookie)
            upstream.assert_not_called()
        self.assertEqual(result['results'][0]['status'], 429)
        self.assertEqual(self.req('/api/status',cookie=cookie)[2]['usage']['remaining'], 0)

    def test_no_implicit_token_in_response_or_assets(self):
        cookie = self.login()
        for path in ['/api/status', '/api/snapshot', '/api/history']:
            response = self.req(path,cookie=cookie)
            self.assertNotIn('private-test-token', str(response))
        for asset in ['web/index.html','web/app.js','web/styles.css']:
            self.assertNotIn('private-test-token', (Path(__file__).resolve().parent.parent/asset).read_text())


if __name__ == '__main__':
    unittest.main()
