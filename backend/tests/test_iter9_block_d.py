"""Iteration 9 — Block D backend tests.

Covers:
- PUT /api/admin/teaching/files/{id}  (replace binary; status -> uploaded)
- PATCH /api/admin/teaching/files/{id}  (label rename only)
- GET /api/admin/teaching/knowledge?confidence=baja  (confidence filter)
- Regression: existing endpoints still work.

Admin password from /app/memory/test_credentials.md
"""
import os
import io
import uuid
import time
import requests
import pytest
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PASSWORD = "signlanguage-admin-2026"
ADMIN_HDR = {"X-Admin-Password": ADMIN_PASSWORD}


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    return s


def _make_docx(text: str = "Hola: configuración de mano A. Mover hacia adelante. Expresión amable.") -> bytes:
    """Create a minimal real .docx file in-memory."""
    try:
        from docx import Document
    except ImportError:
        pytest.skip("python-docx not installed")
    doc = Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------- Regression sanity ----------
class TestRegression:
    def test_health(self, http):
        r = http.get(f"{API}/health", timeout=20)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_text_to_sign(self, http):
        r = http.post(f"{API}/translate/text-to-sign",
                      json={"text": "Hola", "target_language": "LSE"},
                      timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "summary" in data and "steps" in data

    def test_rtc_room(self, http):
        r = http.post(f"{API}/rtc/room", json={}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "room" in body and isinstance(body["room"], str) and len(body["room"]) > 0

    def test_offline_pack(self, http):
        r = http.get(f"{API}/offline/pack", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list) and data.get("count") == len(data["items"])

    def test_admin_teaching_files_no_pwd_401(self, http):
        r = http.get(f"{API}/admin/teaching/files", timeout=20)
        assert r.status_code == 401

    def test_admin_teaching_files_ok(self, http):
        r = http.get(f"{API}/admin/teaching/files", headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_corrections_get(self, http):
        r = http.get(f"{API}/admin/teaching/corrections", headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Helpers: upload a temp file we can mutate ----------
@pytest.fixture(scope="module")
def created_file_id(http):
    """Upload a real docx and yield its id; clean up at end."""
    docx_bytes = _make_docx("Hola: una prueba TEST_iter9.")
    files = {"file": (f"TEST_iter9_{uuid.uuid4().hex[:6]}.docx", docx_bytes,
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    r = http.post(f"{API}/admin/teaching/upload", files=files, headers=ADMIN_HDR, timeout=60)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    yield fid
    # cleanup
    http.delete(f"{API}/admin/teaching/files/{fid}", headers=ADMIN_HDR, timeout=20)


# ---------- PATCH (rename label) ----------
class TestPatchLabel:
    def test_patch_no_pwd_401(self, http, created_file_id):
        r = http.patch(f"{API}/admin/teaching/files/{created_file_id}",
                       json={"label": "x"}, timeout=20)
        assert r.status_code == 401

    def test_patch_missing_label_400(self, http, created_file_id):
        r = http.patch(f"{API}/admin/teaching/files/{created_file_id}",
                       json={}, headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 400

    def test_patch_unknown_id_404(self, http):
        r = http.patch(f"{API}/admin/teaching/files/nope-{uuid.uuid4().hex}",
                       json={"label": "x"}, headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 404

    def test_patch_label_persists(self, http, created_file_id):
        new_label = f"TEST_label_{uuid.uuid4().hex[:6]}"
        r = http.patch(f"{API}/admin/teaching/files/{created_file_id}",
                       json={"label": new_label}, headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("label") == new_label
        assert body.get("id") == created_file_id
        # GET to confirm persistence
        r = http.get(f"{API}/admin/teaching/files", headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 200
        match = next((f for f in r.json() if f["id"] == created_file_id), None)
        assert match is not None
        assert match.get("label") == new_label


# ---------- PUT (replace binary) ----------
class TestPutReplace:
    def test_put_no_pwd_401(self, http, created_file_id):
        files = {"file": ("x.docx", _make_docx("repl"),
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = http.put(f"{API}/admin/teaching/files/{created_file_id}",
                     files=files, timeout=30)
        assert r.status_code == 401

    def test_put_unknown_id_404(self, http):
        files = {"file": ("x.docx", _make_docx(),
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = http.put(f"{API}/admin/teaching/files/nope-{uuid.uuid4().hex}",
                     files=files, headers=ADMIN_HDR, timeout=30)
        assert r.status_code == 404

    def test_put_replaces_and_resets_status(self, http, created_file_id):
        # First mark file as processed by triggering process (if seed allows). Skip — instead
        # seed status by directly checking initial status. We will simulate by:
        # 1) reading current status
        # 2) calling process to flip to processing -> processed/error
        # 3) replace and confirm status -> "uploaded"
        # Step 1: call process so status moves off "uploaded"
        _ = http.post(f"{API}/admin/teaching/process/{created_file_id}",
                      headers=ADMIN_HDR, timeout=30)
        # Wait a beat for status update; we don't need processed, just != uploaded ideally
        time.sleep(2)

        # Step 2: replace binary
        new_bytes = _make_docx("Hola REPLACED contenido — TEST_iter9 PUT.")
        files = {"file": (f"TEST_iter9_replaced_{uuid.uuid4().hex[:6]}.docx", new_bytes,
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = http.put(f"{API}/admin/teaching/files/{created_file_id}",
                     files=files, headers=ADMIN_HDR, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == created_file_id
        assert body["status"] == "uploaded"
        assert body["size"] == len(new_bytes)
        assert body["error"] is None
        assert body["processed_at"] is None
        assert "_id" not in body

        # Step 3: GET list to confirm
        r = http.get(f"{API}/admin/teaching/files", headers=ADMIN_HDR, timeout=20)
        match = next((f for f in r.json() if f["id"] == created_file_id), None)
        assert match is not None
        assert match["status"] == "uploaded"
        assert match["size"] == len(new_bytes)


# ---------- GET /knowledge?confidence=baja ----------
class TestKnowledgeConfidenceFilter:
    @pytest.fixture(scope="class")
    def seeded_kb(self, http):
        """Seed three KB-like entries via corrections (corrections are simpler & deterministic).
        But /admin/teaching/knowledge reads db.knowledge_base, NOT corrections.
        So we must insert via processing. Instead, attempt direct seed by calling
        /admin/teaching/corrections (which writes to db.corrections, separate collection).
        Therefore we need an alternative: seed by calling process on a file we just uploaded,
        OR — preferred — verify the filter shape by passing confidence=baja and asserting the
        response contains ONLY entries whose confidence == 'baja' (or empty list).
        """
        return None

    def test_knowledge_no_pwd_401(self, http):
        r = http.get(f"{API}/admin/teaching/knowledge", timeout=20)
        assert r.status_code == 401

    def test_knowledge_all_returns_list(self, http):
        r = http.get(f"{API}/admin/teaching/knowledge", headers=ADMIN_HDR, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_knowledge_confidence_baja_filters(self, http):
        # Get ALL first
        r_all = http.get(f"{API}/admin/teaching/knowledge",
                         headers=ADMIN_HDR, timeout=20)
        assert r_all.status_code == 200
        all_items = r_all.json()
        # Filter by confidence=baja
        r = http.get(f"{API}/admin/teaching/knowledge",
                     headers=ADMIN_HDR, params={"confidence": "baja"}, timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        # Every returned entry must have confidence == 'baja'
        for it in items:
            assert it.get("confidence") == "baja", \
                f"got non-baja entry in baja filter: {it.get('confidence')!r}"
        # Sanity: count should be <= total
        assert len(items) <= len(all_items)
        # No mongo _id leak
        for it in items:
            assert "_id" not in it

    def test_knowledge_confidence_alta_filters(self, http):
        r = http.get(f"{API}/admin/teaching/knowledge",
                     headers=ADMIN_HDR, params={"confidence": "alta"}, timeout=20)
        assert r.status_code == 200
        for it in r.json():
            assert it.get("confidence") == "alta"

    def test_knowledge_confidence_all_no_filter(self, http):
        r_default = http.get(f"{API}/admin/teaching/knowledge",
                             headers=ADMIN_HDR, timeout=20).json()
        r_all = http.get(f"{API}/admin/teaching/knowledge",
                         headers=ADMIN_HDR, params={"confidence": "all"}, timeout=20).json()
        # confidence='all' must behave the same as no filter
        assert len(r_default) == len(r_all)
