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
        assert "version" in data

    def test_health_endpoint(self, http):
        # Iteration 4: /api/health new endpoint
        r = http.get(f"{API}/health", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("service") == "SignLanguage Pro"
        assert data.get("status") == "ok"
        assert data.get("mongo") == "ok"
        assert "llm_provider" in data
        assert "llm_vision_model" in data
        assert data.get("llm_key_configured") is True


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

    def test_text_to_sign_empty_text_422(self, http):
        # Iteration 4: text validated 1-2000 chars
        r = http.post(f"{API}/translate/text-to-sign", json={"text": ""}, timeout=30)
        assert r.status_code == 422, r.text

    def test_text_to_sign_too_long_422(self, http):
        r = http.post(
            f"{API}/translate/text-to-sign",
            json={"text": "a" * 2001},
            timeout=30,
        )
        assert r.status_code == 422, r.text


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

    def test_translate_video_undecodable_returns_400(self, http):
        # Iteration 4: cannot decode video -> 400
        files = {"file": ("garbage.mp4", b"this is not a real video", "video/mp4")}
        r = http.post(f"{API}/translate/video", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "detail" in r.json()


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
        # Iteration 4: DELETE /history/{id} now returns 404 when not found
        r = http.delete(f"{API}/history/nonexistent-id-xyz", timeout=30)
        assert r.status_code == 404
        assert "detail" in r.json()


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

    def test_translate_frames_empty_returns_422(self, http):
        # Iteration 4: Pydantic min_length=1 -> 422
        r = http.post(f"{API}/translate/frames", json={"frames": []}, timeout=30)
        assert r.status_code == 422, r.text

    def test_translate_frames_too_many_returns_422(self, http, sample_frames):
        # Iteration 4: max_length=14
        payload = {"frames": sample_frames * 3}  # 18 frames > 14
        r = http.post(f"{API}/translate/frames", json=payload, timeout=30)
        assert r.status_code == 422, r.text

    def test_translate_frames_short_b64_returns_422(self, http):
        # Iteration 4: each frame must be >= 24 chars
        r = http.post(f"{API}/translate/frames", json={"frames": ["abc"]}, timeout=30)
        assert r.status_code == 422, r.text

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

    def test_fingerspelling_empty_returns_422(self, http):
        # Iteration 4: Pydantic min_length=1 -> 422
        r = http.post(f"{API}/translate/fingerspelling", json={"frames": []}, timeout=30)
        assert r.status_code == 422


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


# ---------- Analytics (Iteration 3) ----------
class TestAnalytics:
    """Analytics endpoints: /api/analytics/event (POST) and /api/analytics/summary (GET).

    Covers:
    - Manual event recording via POST /analytics/event
    - Summary structure (totals, by_type, by_mode, by_language, by_day, top_words, top_dictionary_searches)
    - by_day series length matches the `days` query param
    - Empty-state safety (zero translations + only events still returns valid JSON)
    - Auto event recording from translate/* endpoints + dictionary search
    - Events accumulate independently of db.translations (DELETE /history doesn't clear events)
    """

    def test_post_analytics_event_minimal(self, http):
        unique_type = f"TEST_event_{uuid.uuid4().hex[:8]}"
        r = http.post(
            f"{API}/analytics/event",
            json={"type": unique_type, "data": {"foo": "bar", "n": 1}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"ok": True}

        # Verify it shows up in summary by_type
        time.sleep(0.3)
        s = http.get(f"{API}/analytics/summary", params={"days": 7}, timeout=30)
        assert s.status_code == 200, s.text
        data = s.json()
        assert "by_type" in data
        assert data["by_type"].get(unique_type, 0) >= 1, data["by_type"]

    def test_post_analytics_event_no_data(self, http):
        # data field is optional
        r = http.post(
            f"{API}/analytics/event",
            json={"type": "TEST_no_data_event"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_post_analytics_event_invalid_payload(self, http):
        # Missing required 'type' must yield 422
        r = http.post(f"{API}/analytics/event", json={"data": {"x": 1}}, timeout=30)
        assert r.status_code == 422

    def test_post_analytics_event_invalid_type_regex(self, http):
        # Iteration 4: type must match ^[a-zA-Z0-9_\-.]+$
        for bad in ["bad type", "spaces here", "with/slash", "colon:type", "★star"]:
            r = http.post(
                f"{API}/analytics/event",
                json={"type": bad, "data": {}},
                timeout=30,
            )
            assert r.status_code == 422, f"expected 422 for type={bad!r}, got {r.status_code} body={r.text[:200]}"

    def test_post_analytics_event_too_long_type(self, http):
        # max_length=64
        r = http.post(
            f"{API}/analytics/event",
            json={"type": "a" * 65, "data": {}},
            timeout=30,
        )
        assert r.status_code == 422

    def test_post_analytics_event_valid_chars(self, http):
        # Allowed chars: a-zA-Z0-9_-.
        for good in ["a.b.c", "type_1", "TYPE-2", "x.y_z-1"]:
            r = http.post(
                f"{API}/analytics/event",
                json={"type": good, "data": {}},
                timeout=30,
            )
            assert r.status_code == 200, f"expected 200 for type={good!r}, got {r.status_code}"

    def test_summary_structure_and_keys(self, http):
        r = http.get(f"{API}/analytics/summary", params={"days": 14}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in (
            "totals",
            "by_type",
            "by_mode",
            "by_language",
            "by_day",
            "top_words",
            "top_dictionary_searches",
        ):
            assert key in data, f"missing {key} in summary"
        # totals shape
        assert "translations" in data["totals"]
        assert "events" in data["totals"]
        assert isinstance(data["totals"]["translations"], int)
        assert isinstance(data["totals"]["events"], int)
        # types
        assert isinstance(data["by_type"], dict)
        assert isinstance(data["by_mode"], list)
        assert isinstance(data["by_language"], list)
        assert isinstance(data["by_day"], list)
        assert isinstance(data["top_words"], list)
        assert isinstance(data["top_dictionary_searches"], list)
        # by_day length == days
        assert len(data["by_day"]) == 14
        for entry in data["by_day"]:
            assert "day" in entry and "count" in entry
            assert isinstance(entry["count"], int)

    def test_summary_days_param_changes_series_length(self, http):
        r = http.get(f"{API}/analytics/summary", params={"days": 3}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["by_day"]) == 3

        r = http.get(f"{API}/analytics/summary", params={"days": 30}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["by_day"]) == 30

    def test_summary_empty_state_is_safe(self, http):
        # Clear translations; events should still aggregate fine and translations totals=0
        clr = http.delete(f"{API}/history", timeout=30)
        assert clr.status_code == 200

        r = http.get(f"{API}/analytics/summary", params={"days": 14}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # After clearing, translations count must be 0
        assert data["totals"]["translations"] == 0
        # No translations -> by_mode/by_language/top_words derived from translations should be empty
        assert data["by_mode"] == []
        assert data["by_language"] == []
        assert data["top_words"] == []
        # by_day still present and zero-filled
        assert len(data["by_day"]) == 14
        assert all(e["count"] == 0 for e in data["by_day"])
        # events are NOT cleared by /history delete; events count may be > 0
        assert isinstance(data["totals"]["events"], int)

    def test_dictionary_search_records_event(self, http):
        unique_q = f"test_q_{uuid.uuid4().hex[:6]}"  # backend lowercases q before recording
        # Take a baseline count
        before = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        before_ds = before["by_type"].get("dictionary_search", 0)

        # Issue a dictionary search (q triggers record_event)
        r = http.get(f"{API}/dictionary", params={"q": unique_q}, timeout=30)
        assert r.status_code == 200

        time.sleep(0.4)
        after = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        after_ds = after["by_type"].get("dictionary_search", 0)
        assert after_ds == before_ds + 1, (
            f"dictionary_search count did not increase: before={before_ds} after={after_ds}"
        )

        # Search query should also appear in top_dictionary_searches (we used a unique q)
        # backend lowercases q in record_event
        top = after.get("top_dictionary_searches", [])
        assert any(it.get("q") == unique_q.lower() for it in top), top

    def test_dictionary_no_q_does_not_record_event(self, http):
        # Listing without q must NOT record an event
        before = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        before_ds = before["by_type"].get("dictionary_search", 0)

        r = http.get(f"{API}/dictionary", timeout=30)
        assert r.status_code == 200

        time.sleep(0.3)
        after = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        after_ds = after["by_type"].get("dictionary_search", 0)
        assert after_ds == before_ds, "dictionary listing without q must not create event"

    def test_text_to_sign_records_event(self, http):
        before = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        before_t2s = before["by_type"].get("text_to_sign", 0)

        r = http.post(
            f"{API}/translate/text-to-sign",
            json={"text": "Hola analytics", "target_language": "LSE"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text

        time.sleep(0.5)
        after = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        after_t2s = after["by_type"].get("text_to_sign", 0)
        assert after_t2s == before_t2s + 1, (
            f"text_to_sign event not recorded: before={before_t2s} after={after_t2s}"
        )

        # Translations totals should also have grown by exactly 1
        assert after["totals"]["translations"] >= before["totals"]["translations"] + 1

    def test_translate_frames_records_event(self, http, sample_frames):
        before = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        before_tf = before["by_type"].get("translate_frames", 0)

        r = http.post(
            f"{API}/translate/frames",
            json={"frames": sample_frames[:3], "mode": "streaming", "duration": 1.0},
            timeout=TIMEOUT,
        )
        # AI may 502 on synthetic frames; only assert event when 200
        assert r.status_code in (200, 502), r.text

        time.sleep(0.4)
        after = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        after_tf = after["by_type"].get("translate_frames", 0)
        if r.status_code == 200:
            assert after_tf == before_tf + 1, (
                f"translate_frames event not recorded on 200: before={before_tf} after={after_tf}"
            )
        else:
            # On 502 (Gemini failure before record_event) event must NOT be recorded
            assert after_tf == before_tf

    def test_fingerspelling_records_event(self, http, sample_frames):
        before = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        before_fs = before["by_type"].get("fingerspelling", 0)

        r = http.post(
            f"{API}/translate/fingerspelling",
            json={"frames": sample_frames[:3]},
            timeout=TIMEOUT,
        )
        assert r.status_code in (200, 502), r.text

        time.sleep(0.4)
        after = http.get(f"{API}/analytics/summary", params={"days": 1}, timeout=30).json()
        after_fs = after["by_type"].get("fingerspelling", 0)
        if r.status_code == 200:
            assert after_fs == before_fs + 1
        else:
            assert after_fs == before_fs

    def test_events_persist_after_history_clear(self, http):
        # Push an event, clear history, verify event count not reduced
        marker = f"TEST_persist_{uuid.uuid4().hex[:8]}"
        r = http.post(
            f"{API}/analytics/event",
            json={"type": marker, "data": {}},
            timeout=30,
        )
        assert r.status_code == 200

        # Clear translations
        r = http.delete(f"{API}/history", timeout=30)
        assert r.status_code == 200

        s = http.get(f"{API}/analytics/summary", params={"days": 14}, timeout=30).json()
        # Translations cleared
        assert s["totals"]["translations"] == 0
        # But events still include our marker
        assert s["by_type"].get(marker, 0) >= 1

