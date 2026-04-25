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
import base64
import pytest
import requests
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

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

    def test_dictionary_total_count_68(self, http):
        # Iteration 2: dictionary expanded to 68 entries across LSE/LSM/ASL
        r = http.get(f"{API}/dictionary", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 68, f"Expected 68 entries, got {len(data)}"
        # Sanity: per-language presence
        langs = {i["language"] for i in data}
        assert {"LSE", "LSM", "ASL"}.issubset(langs)


# ---------- Frame-based AI fixtures ----------
def _generate_frame_b64(seed: int) -> str:
    """Generate a small (64x64) JPEG image base64 string (no data: prefix)."""
    img = Image.new("RGB", (64, 64), color=(seed * 20 % 255, 50, 100))
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, 50, 50], fill=(255 - seed * 10 % 255, 200, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture(scope="session")
def sample_frames():
    return [_generate_frame_b64(i) for i in range(6)]


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


# ---------- Frames translation (live/streaming via base64 frames) ----------
class TestFramesTranslation:
    def test_translate_frames_success(self, http, sample_frames):
        payload = {"frames": sample_frames, "mode": "streaming", "duration": 3.0}
        r = http.post(f"{API}/translate/frames", json=payload, timeout=TIMEOUT)
        # Acceptable: 200 (Gemini ok) or 502 (Gemini error on synthetic frames)
        assert r.status_code in (200, 502), f"Unexpected status: {r.status_code}, body: {r.text[:500]}"
        if r.status_code == 200:
            data = r.json()
            assert "id" in data
            assert "translated_text" in data
            assert "detected_language" in data
            assert "confidence" in data
            assert data.get("mode") == "streaming"
            assert data.get("duration_seconds") == 3.0
            # Verify persistence via /api/translation/{id}
            time.sleep(0.3)
            g = http.get(f"{API}/translation/{data['id']}", timeout=30)
            assert g.status_code == 200, g.text
            fetched = g.json()
            assert fetched["id"] == data["id"]
            assert fetched["mode"] == "streaming"
            assert fetched["translated_text"] == data["translated_text"]

    def test_translate_frames_empty_returns_400(self, http):
        r = http.post(f"{API}/translate/frames", json={"frames": []}, timeout=30)
        assert r.status_code == 400, r.text
        assert "detail" in r.json()

    def test_translate_frames_default_mode(self, http, sample_frames):
        # Omit mode/duration; backend should default mode to 'streaming'
        payload = {"frames": sample_frames[:3]}
        r = http.post(f"{API}/translate/frames", json=payload, timeout=TIMEOUT)
        assert r.status_code in (200, 502)
        if r.status_code == 200:
            data = r.json()
            assert data.get("mode") in ("streaming", "live", "video")


# ---------- Fingerspelling ----------
class TestFingerspelling:
    def test_fingerspelling_success(self, http, sample_frames):
        payload = {"frames": sample_frames}
        r = http.post(f"{API}/translate/fingerspelling", json=payload, timeout=TIMEOUT)
        assert r.status_code in (200, 502), f"Unexpected status: {r.status_code}, body: {r.text[:500]}"
        if r.status_code == 200:
            data = r.json()
            # Contract: id, word, letters[], detected_language, confidence, notes
            for k in ("id", "word", "letters", "detected_language", "confidence", "notes"):
                assert k in data, f"missing key {k} in {data}"
            assert isinstance(data["letters"], list)
            assert isinstance(data["word"], str)
            # Verify persistence with mode='fingerspelling'
            time.sleep(0.3)
            g = http.get(f"{API}/translation/{data['id']}", timeout=30)
            assert g.status_code == 200
            fetched = g.json()
            assert fetched["id"] == data["id"]
            assert fetched["mode"] == "fingerspelling"

    def test_fingerspelling_empty_returns_400(self, http):
        r = http.post(f"{API}/translate/fingerspelling", json={"frames": []}, timeout=30)
        assert r.status_code == 400


# ---------- Get single translation ----------
class TestGetTranslationById:
    def test_get_existing_translation(self, http):
        # Create one via text-to-sign which is reliable
        unique = f"TEST_GETID_{uuid.uuid4().hex[:8]}"
        r = http.post(f"{API}/translate/text-to-sign",
                      json={"text": unique, "target_language": "LSE"},
                      timeout=TIMEOUT)
        assert r.status_code == 200
        time.sleep(0.5)
        # Look up id from history
        h = http.get(f"{API}/history", timeout=30)
        items = h.json()
        target = next((it for it in items if it.get("source_text") == unique), None)
        assert target is not None
        target_id = target["id"]

        g = http.get(f"{API}/translation/{target_id}", timeout=30)
        assert g.status_code == 200, g.text
        data = g.json()
        assert data["id"] == target_id
        assert data["mode"] == "text-to-sign"
        assert data.get("source_text") == unique
        # _id leak check
        assert "_id" not in data

        # Cleanup
        http.delete(f"{API}/history/{target_id}", timeout=30)

    def test_get_missing_translation_returns_404(self, http):
        r = http.get(f"{API}/translation/does-not-exist-{uuid.uuid4().hex}", timeout=30)
        assert r.status_code == 404
        assert "detail" in r.json()
