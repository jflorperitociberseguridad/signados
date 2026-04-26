"""Iteration 7 tests — Phase 2 Block B.

Covers:
- /api/health
- /api/email/status (configured=False)
- /api/email/share (graceful no-op {sent:false, reason:'resend_not_configured'})
- /api/rtc/room (4-12 char alphanumeric uppercase code)
- /api/rtc/ice (Google STUN)
- /api/rtc/stats
- /api/rtc/{room} websocket (2 peers exchange offer/answer/ice/etc)
- /api/offline/pack (default 30)
- Regression: /api/translate/text-to-sign, /api/dictionary, /api/history, /api/billing/plans, /api/admin/login
"""

import os
import re
import json
import asyncio
import uuid
from pathlib import Path

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

# Build ws URL from http(s)
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN_PASSWORD = "signlanguage-admin-2026"

ROOM_RE = re.compile(r"^[A-Z0-9]{4,12}$")


@pytest.fixture(scope="session")
def http():
    return requests.Session()


# ---------- Health ----------
class TestHealthAndEmailStatus:
    def test_health(self, http):
        r = http.get(f"{API}/health", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") in ("ok", "degraded")
        assert "mongo" in data

    def test_email_status_not_configured(self, http):
        r = http.get(f"{API}/email/status", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "configured" in data
        # Per task: RESEND_API_KEY intentionally empty → False
        assert data["configured"] is False, data


# ---------- Email share graceful no-op ----------
class TestEmailShareGraceful:
    def test_share_returns_not_configured(self, http):
        payload = {
            "to": "test@example.com",
            "translation_text": "Hola mundo",
            "language": "LSE",
            "share_url": "https://example.com/x",
            "sender_name": "Tester",
        }
        r = http.post(f"{API}/email/share", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sent") is False, data
        # reason should indicate resend not configured
        reason = (data.get("reason") or "").lower()
        assert "resend" in reason or "configured" in reason or "not_configured" in reason, data

    def test_share_invalid_email_422(self, http):
        r = http.post(
            f"{API}/email/share",
            json={"to": "not-an-email", "translation_text": "x", "share_url": "u"},
            timeout=30,
        )
        assert r.status_code == 422


# ---------- RTC HTTP endpoints ----------
class TestRtcHttp:
    def test_create_room_returns_uppercase_alnum(self, http):
        r = http.post(f"{API}/rtc/room", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "room" in data, data
        room = data["room"]
        assert isinstance(room, str)
        assert ROOM_RE.match(room), f"bad room code: {room!r}"
        # store for ws test
        pytest.rtc_room = room

    def test_ice_returns_google_stun(self, http):
        r = http.get(f"{API}/rtc/ice", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "iceServers" in data
        servers = data["iceServers"]
        assert isinstance(servers, list) and len(servers) >= 1
        urls_flat = []
        for s in servers:
            u = s.get("urls")
            if isinstance(u, list):
                urls_flat.extend(u)
            elif isinstance(u, str):
                urls_flat.append(u)
        assert any("stun.l.google.com" in u for u in urls_flat), urls_flat

    def test_stats_shape(self, http):
        r = http.get(f"{API}/rtc/stats", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rooms" in data and "peers" in data
        assert isinstance(data["rooms"], int)
        assert isinstance(data["peers"], int)


# ---------- RTC WebSocket signaling ----------
@pytest.mark.asyncio
async def test_rtc_websocket_two_peer_signaling():
    # Get a fresh room
    r = requests.post(f"{API}/rtc/room", timeout=30)
    assert r.status_code == 200
    room = r.json()["room"]

    ws_url = f"{WS_BASE}/api/rtc/{room}"

    async with websockets.connect(ws_url) as a:
        async with websockets.connect(ws_url) as b:
            # peer-joined event should arrive at "a" when b joins
            try:
                msg_a_initial = await asyncio.wait_for(a.recv(), timeout=8)
            except asyncio.TimeoutError:
                pytest.fail("Peer A did not receive peer-joined within 8s")
            data_a = json.loads(msg_a_initial)
            # Be permissive about exact field naming (peer-joined / peer_joined / type)
            blob = json.dumps(data_a).lower()
            assert "peer" in blob and ("join" in blob or "ready" in blob), data_a

            # A sends offer → B should receive
            offer = {"type": "offer", "sdp": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-"}
            await a.send(json.dumps(offer))
            try:
                got_b = await asyncio.wait_for(b.recv(), timeout=5)
            except asyncio.TimeoutError:
                # b may have received an earlier "peer-joined" first; drain
                pytest.fail("Peer B did not receive offer")
            blob_b = json.dumps(json.loads(got_b)).lower()
            # Accept if b first received a peer-ready/joined event; then read next for offer
            if "offer" not in blob_b:
                got_b2 = await asyncio.wait_for(b.recv(), timeout=5)
                blob_b = json.dumps(json.loads(got_b2)).lower()
            assert "offer" in blob_b, blob_b

            # B sends answer → A should receive
            ans = {"type": "answer", "sdp": "v=0..."}
            await b.send(json.dumps(ans))
            got_a = await asyncio.wait_for(a.recv(), timeout=5)
            blob_a = json.dumps(json.loads(got_a)).lower()
            if "answer" not in blob_a:
                got_a2 = await asyncio.wait_for(a.recv(), timeout=5)
                blob_a = json.dumps(json.loads(got_a2)).lower()
            assert "answer" in blob_a, blob_a

            # subtitle relay
            sub = {"type": "subtitle", "text": "hola"}
            await a.send(json.dumps(sub))
            got_sub = await asyncio.wait_for(b.recv(), timeout=5)
            assert "subtitle" in got_sub.lower() or "hola" in got_sub.lower()

    # peer-left should bump stats back down — give it a moment then check
    await asyncio.sleep(0.4)
    s = requests.get(f"{API}/rtc/stats", timeout=10).json()
    assert isinstance(s["peers"], int)


# ---------- Offline pack ----------
class TestOfflinePack:
    def test_offline_pack_default_30(self, http):
        r = http.get(f"{API}/offline/pack", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("version", "count", "items"):
            assert k in data, data
        assert data["count"] == len(data["items"])
        assert data["count"] == 30
        # spot-check item shape
        sample = data["items"][0]
        for k in ("word", "language", "description", "hands"):
            assert k in sample

    def test_offline_pack_limit_param(self, http):
        r = http.get(f"{API}/offline/pack", params={"limit": 10}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 10


# ---------- Regression ----------
class TestRegression:
    def test_text_to_sign_works(self, http):
        r = http.post(
            f"{API}/translate/text-to-sign",
            json={"text": "Hola", "target_language": "LSE"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "steps" in data

    def test_dictionary_lists(self, http):
        r = http.get(f"{API}/dictionary", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) > 0

    def test_history_lists(self, http):
        r = http.get(f"{API}/history", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_billing_plans(self, http):
        r = http.get(f"{API}/billing/plans", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "free" in data and "packages" in data

    def test_admin_login_correct_password(self, http):
        r = http.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
