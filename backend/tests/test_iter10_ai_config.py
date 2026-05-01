"""
Iteration 10 — Smoke + Phase 2 Block E: AI Config endpoints.

Covers:
- Health, dictionary, history, text-to-sign (general smoke)
- Admin gate: files/videos/stats/knowledge (401 without header, 200 with)
- NEW: /api/admin/teaching/ai-config GET / PUT / reset / test
- WebRTC signaling endpoint exists
"""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    env_path = "/app/frontend/.env"
    with open(env_path) as _f:
        for _line in _f:
            if _line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = _line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
ADMIN_PWD = "signlanguage-admin-2026"
ADMIN_HEADERS = {"X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------------------- Smoke: public endpoints --------------------
class TestPublicSmoke:
    def test_health_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_dictionary_nonempty(self, client):
        r = client.get(f"{BASE_URL}/api/dictionary")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data)
        assert isinstance(items, list)
        assert len(items) > 0

    def test_history_list(self, client):
        r = client.get(f"{BASE_URL}/api/history")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)

    def test_text_to_sign(self, client):
        r = client.post(
            f"{BASE_URL}/api/translate/text-to-sign",
            json={"text": "hola", "language": "LSE"},
        )
        assert r.status_code == 200
        body = r.json()
        # contract from iter9: returns summary/steps OR tokens/sequence
        assert any(k in body for k in ("tokens", "sequence", "summary", "steps"))


# -------------------- Admin gate --------------------
class TestAdminGate:
    def test_files_requires_admin(self, client):
        r = client.get(f"{BASE_URL}/api/admin/teaching/files")
        assert r.status_code in (401, 403)

    def test_files_with_admin(self, client):
        r = client.get(f"{BASE_URL}/api/admin/teaching/files", headers=ADMIN_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or "items" in data

    def test_videos_with_admin(self, client):
        r = client.get(f"{BASE_URL}/api/admin/teaching/videos", headers=ADMIN_HEADERS)
        assert r.status_code == 200

    def test_stats_with_admin(self, client):
        r = client.get(f"{BASE_URL}/api/admin/teaching/stats", headers=ADMIN_HEADERS)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_knowledge_with_admin(self, client):
        r = client.get(
            f"{BASE_URL}/api/admin/teaching/knowledge?limit=5",
            headers=ADMIN_HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        # may be empty, but structure is a list
        assert isinstance(items, list)


# -------------------- NEW: AI Config endpoints --------------------
class TestAIConfig:
    AI_CFG_URL = f"{BASE_URL}/api/admin/teaching/ai-config"

    EXPECTED_KEYS = {
        "text_model", "vision_model", "system_prompt",
        "available_text_models", "available_vision_models",
        "default_system_prompt", "max_text_chunks", "max_image_batch",
        "video_frames_count", "min_confidence_keep", "auto_process",
    }

    def test_get_requires_admin(self, client):
        r = client.get(self.AI_CFG_URL)
        assert r.status_code in (401, 403)

    def test_get_returns_full_shape(self, client):
        r = client.get(self.AI_CFG_URL, headers=ADMIN_HEADERS)
        assert r.status_code == 200
        data = r.json()
        missing = self.EXPECTED_KEYS - set(data.keys())
        assert not missing, f"Missing keys in ai-config response: {missing}"
        assert isinstance(data["available_text_models"], list)
        assert "gpt-4o-mini" in data["available_text_models"]
        assert isinstance(data["available_vision_models"], list)
        assert isinstance(data["default_system_prompt"], str)
        assert len(data["default_system_prompt"]) > 0

    def test_put_update_text_model_persists(self, client):
        # Change to gpt-4o-mini
        r_put = client.put(
            self.AI_CFG_URL,
            headers=ADMIN_HEADERS,
            json={"text_model": "gpt-4o-mini"},
        )
        assert r_put.status_code == 200, r_put.text
        updated = r_put.json()
        assert updated["text_model"] == "gpt-4o-mini"

        # Verify persistence via GET
        r_get = client.get(self.AI_CFG_URL, headers=ADMIN_HEADERS)
        assert r_get.status_code == 200
        assert r_get.json()["text_model"] == "gpt-4o-mini"

    def test_put_rejects_invalid_model(self, client):
        r = client.put(
            self.AI_CFG_URL,
            headers=ADMIN_HEADERS,
            json={"text_model": "bogus-model-xyz"},
        )
        assert r.status_code == 400

    def test_put_requires_admin(self, client):
        r = client.put(self.AI_CFG_URL, json={"text_model": "gpt-4o-mini"})
        assert r.status_code in (401, 403)

    def test_reset_restores_defaults(self, client):
        # First set a custom value
        client.put(
            self.AI_CFG_URL,
            headers=ADMIN_HEADERS,
            json={"text_model": "gpt-4o-mini", "max_text_chunks": 3},
        )
        r = client.post(
            f"{self.AI_CFG_URL}/reset", headers=ADMIN_HEADERS
        )
        assert r.status_code == 200
        data = r.json()
        # After reset, config should be pure defaults (no custom overrides)
        # We don't know the exact defaults, but structure must still be valid
        assert "text_model" in data
        assert "system_prompt" in data

    def test_reset_requires_admin(self, client):
        r = client.post(f"{self.AI_CFG_URL}/reset")
        assert r.status_code in (401, 403)

    def test_ai_config_test_endpoint(self, client):
        r = client.post(f"{self.AI_CFG_URL}/test", headers=ADMIN_HEADERS, timeout=60)
        assert r.status_code == 200
        body = r.json()
        assert "ok" in body
        if body["ok"]:
            assert "model_used" in body
            assert "items_extracted" in body
            assert isinstance(body["items_extracted"], int)
        else:
            # If ok=false, error must be surfaced (e.g., LLM key invalid)
            assert "error" in body

    def test_ai_config_test_requires_admin(self, client):
        r = client.post(f"{self.AI_CFG_URL}/test")
        assert r.status_code in (401, 403)


# -------------------- WebRTC signaling endpoint exists --------------------
class TestRTCSignaling:
    def test_rtc_room_endpoint(self, client):
        r = client.post(f"{BASE_URL}/api/rtc/room")
        assert r.status_code == 200
        body = r.json()
        assert "room" in body or "code" in body

    def test_rtc_stats(self, client):
        r = client.get(f"{BASE_URL}/api/rtc/stats")
        assert r.status_code == 200
