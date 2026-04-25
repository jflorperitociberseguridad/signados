"""Backend API tests for SignLanguage Pro.

Covers:
- Health endpoint (GET /api/)
- Dictionary list + filters + languages
- Text-to-sign translation (Gemini)
- Video translation (Gemini multipart upload)
- History CRUD (list, delete one, clear all)
"""

import os
import io
import uuid
import time
import pytest
import requests
import subprocess
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read from /app/frontend/.env
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break

BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

TIMEOUT = 120  # AI responses can be slow


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def tiny_video_path(tmp_path_factory):
    """Generate a tiny black 1-sec mp4 for video upload tests."""
    out = tmp_path_factory.mktemp("media") / "tiny.mp4"
    # Already produced one earlier? Just generate fresh.
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    assert out.exists() and out.stat().st_size > 0
    return str(out)


# ---------- Health ----------
class TestHealth:
    def test_root_health(self, http):
        r = http.get(f"{API}/", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("service") == "SignLanguage Pro"
        assert data.get("status") == "ok"


# ---------- Dictionary ----------
class TestDictionary:
    def test_list_all(self, http):
        r = http.get(f"{API}/dictionary", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # validate shape
        item = data[0]
        for key in ("word", "language", "description", "hands", "mouth", "expression"):
            assert key in item, f"missing key {key} in {item}"

    def test_filter_by_query(self, http):
        r = http.get(f"{API}/dictionary", params={"q": "hola"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # all results contain 'hola' in word or description (case-insensitive)
        for item in data:
            blob = (item["word"] + " " + item["description"]).lower()
            assert "hola" in blob

    def test_filter_by_language(self, http):
        r = http.get(f"{API}/dictionary", params={"language": "LSE"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(i["language"] == "LSE" for i in data)

    def test_filter_combined(self, http):
        r = http.get(f"{API}/dictionary", params={"q": "hola", "language": "LSM"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Hola exists in LSM seed
        assert any(i["language"] == "LSM" and "hola" in i["word"].lower() for i in data)

    def test_languages_endpoint(self, http):
        r = http.get(f"{API}/dictionary/languages", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "languages" in data
        assert isinstance(data["languages"], list)
        # Should contain at least these
        for lang in ("LSE", "LSM", "ASL"):
            assert lang in data["languages"], data


# ---------- Text-to-sign ----------
class TestTextToSign:
    def test_translate_text(self, http):
        payload = {"text": "Hola, ¿cómo estás?", "target_language": "LSE"}
        r = http.post(f"{API}/translate/text-to-sign", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert data["text"] == payload["text"]
        assert "language" in data
        assert "summary" in data
        assert "steps" in data
        assert isinstance(data["steps"], list)
        # verify step shape if AI returned steps
        if data["steps"]:
            step = data["steps"][0]
            # at least some of these keys must be present from prompt contract
            keys_present = sum(k in step for k in ("hands", "mouth", "expression", "body"))
            assert keys_present >= 2, f"Expected some sign-component keys in step, got {step}"

    def test_translate_text_auto_language(self, http):
        payload = {"text": "Gracias"}
        r = http.post(f"{API}/translate/text-to-sign", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["text"] == "Gracias"


# ---------- Video translation ----------
class TestVideoTranslation:
    def test_translate_video(self, http, tiny_video_path):
        with open(tiny_video_path, "rb") as f:
            files = {"file": ("tiny.mp4", f, "video/mp4")}
            data = {"mode": "video", "duration": "1.0"}
            r = http.post(f"{API}/translate/video", files=files, data=data, timeout=TIMEOUT)
        # Acceptable: 200 (success) or 502 (Gemini failure on empty/black video)
        assert r.status_code in (200, 502), f"Unexpected status: {r.status_code} body={r.text[:500]}"
        if r.status_code == 200:
            body = r.json()
            assert "id" in body
            assert "translated_text" in body
            assert "detected_language" in body
            assert "confidence" in body
            assert body.get("mode") == "video"
        else:
            # 502 must include detail
            body = r.json()
            assert "detail" in body


# ---------- History ----------
class TestHistory:
    def test_history_list_after_text_to_sign(self, http):
        # First create at least one entry via text-to-sign
        unique = f"TEST_{uuid.uuid4().hex[:8]}"
        payload = {"text": f"prueba {unique}", "target_language": "LSE"}
        r = http.post(f"{API}/translate/text-to-sign", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text

        # Small wait to ensure persistence
        time.sleep(0.5)

        r = http.get(f"{API}/history", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0
        # No mongo _id should leak
        for it in items:
            assert "_id" not in it
        # Sorted desc by created_at: first item should be most recent
        if len(items) >= 2:
            assert items[0]["created_at"] >= items[1]["created_at"]
        # verify our entry is in there
        assert any(it.get("source_text") == payload["text"] for it in items), \
            "Newly created entry missing from history"

    def test_delete_history_item(self, http):
        # Create a text-to-sign entry then locate it in history and delete by id
        unique = f"TEST_DELETE_{uuid.uuid4().hex[:8]}"
        payload = {"text": unique, "target_language": "LSE"}
        r = http.post(f"{API}/translate/text-to-sign", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200

        time.sleep(0.5)
        r = http.get(f"{API}/history", timeout=30)
        items = r.json()
        target = next((it for it in items if it.get("source_text") == unique), None)
        assert target is not None, "Could not find created history item"
        target_id = target["id"]

        r = http.delete(f"{API}/history/{target_id}", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("deleted") == 1

        # Verify removal
        r = http.get(f"{API}/history", timeout=30)
        items = r.json()
        assert not any(it["id"] == target_id for it in items)

    def test_clear_history(self, http):
        # Ensure at least one item exists
        r = http.post(f"{API}/translate/text-to-sign",
                      json={"text": "limpiar test", "target_language": "LSE"},
                      timeout=TIMEOUT)
        assert r.status_code == 200

        r = http.delete(f"{API}/history", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "deleted" in body
        assert isinstance(body["deleted"], int)
        assert body["deleted"] >= 1

        # Now history should be empty
        r = http.get(f"{API}/history", timeout=30)
        assert r.status_code == 200
        assert r.json() == []

    def test_delete_nonexistent_item(self, http):
        r = http.delete(f"{API}/history/nonexistent-id-xyz", timeout=30)
        assert r.status_code == 200
        assert r.json().get("deleted") == 0
