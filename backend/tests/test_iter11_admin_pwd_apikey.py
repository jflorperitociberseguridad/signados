"""Iteration 11 backend regression tests.

Covers:
- POST /api/admin/change-password (rotate + verify + restore)
- GET/PUT/DELETE /api/admin/teaching/api-key (custom OpenAI key CRUD + auth gate)
- POST /api/admin/teaching/api-key/test (active key smoke test)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_PWD = "signlanguage-admin-2026"
HDR = {"X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json"}


# ---------------- Admin password rotation ----------------
class TestAdminChangePassword:
    TEMP_PWD = "tempPwd-iter11-xyz"

    def test_change_pwd_wrong_current_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/change-password",
            headers={"Content-Type": "application/json"},
            json={"current_password": "wrong-pass", "new_password": "whatever123"},
        )
        assert r.status_code == 401, r.text

    def test_change_pwd_too_short_returns_422(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/change-password",
            headers={"Content-Type": "application/json"},
            json={"current_password": ADMIN_PWD, "new_password": "ab"},
        )
        assert r.status_code == 422, r.text

    def test_change_pwd_full_cycle(self):
        # rotate to TEMP
        r1 = requests.post(
            f"{BASE_URL}/api/admin/change-password",
            headers={"Content-Type": "application/json"},
            json={"current_password": ADMIN_PWD, "new_password": self.TEMP_PWD},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("ok") is True

        # verify OLD pwd now rejected on a gated endpoint
        r_old = requests.get(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r_old.status_code == 401

        # verify NEW pwd accepted
        r_new = requests.get(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers={"X-Admin-Password": self.TEMP_PWD},
        )
        assert r_new.status_code == 200

        # restore to canonical pwd
        r_restore = requests.post(
            f"{BASE_URL}/api/admin/change-password",
            headers={"Content-Type": "application/json"},
            json={"current_password": self.TEMP_PWD, "new_password": ADMIN_PWD},
        )
        assert r_restore.status_code == 200, r_restore.text

        # final sanity: canonical pwd works again
        r_final = requests.get(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers=HDR,
        )
        assert r_final.status_code == 200


# ---------------- Custom OpenAI key CRUD ----------------
class TestCustomApiKey:
    FAKE_KEY = "sk-test-iter11-abcdef1234567890"

    def test_a_auth_required(self):
        # GET without header
        r = requests.get(f"{BASE_URL}/api/admin/teaching/api-key")
        assert r.status_code == 401
        # PUT without header
        r2 = requests.put(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers={"Content-Type": "application/json"},
            json={"api_key": self.FAKE_KEY},
        )
        assert r2.status_code == 401
        # DELETE without header
        r3 = requests.delete(f"{BASE_URL}/api/admin/teaching/api-key")
        assert r3.status_code == 401

    def test_b_initial_state_no_custom(self):
        # Ensure clean state first
        requests.delete(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        r = requests.get(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        assert r.status_code == 200
        data = r.json()
        assert data["has_custom_key"] is False
        assert data["masked_key"] == ""
        assert data["active_source"] in ("emergent_universal", "openai_env", "none")

    def test_c_put_invalid_prefix_returns_400(self):
        r = requests.put(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers=HDR,
            json={"api_key": "invalid-nosk-prefix-123456"},
        )
        assert r.status_code == 400

    def test_d_put_valid_and_verify_masked(self):
        r = requests.put(
            f"{BASE_URL}/api/admin/teaching/api-key",
            headers=HDR,
            json={"api_key": self.FAKE_KEY},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["has_custom_key"] is True
        assert data["masked_key"].endswith(self.FAKE_KEY[-4:])

        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        assert g.status_code == 200
        gd = g.json()
        assert gd["has_custom_key"] is True
        assert gd["active_source"] == "custom"
        assert gd["masked_key"].endswith(self.FAKE_KEY[-4:])

    def test_e_delete_reverts(self):
        r = requests.delete(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        assert r.status_code == 200
        assert r.json().get("has_custom_key") is False
        g = requests.get(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        assert g.status_code == 200
        gd = g.json()
        assert gd["has_custom_key"] is False
        assert gd["active_source"] != "custom"


# ---------------- Test endpoint (active key smoke) ----------------
class TestApiKeyTest:
    def test_requires_admin(self):
        r = requests.post(f"{BASE_URL}/api/admin/teaching/api-key/test")
        assert r.status_code == 401

    def test_returns_source_and_model(self):
        # Ensure no custom key → emergent universal path
        requests.delete(f"{BASE_URL}/api/admin/teaching/api-key", headers=HDR)
        r = requests.post(f"{BASE_URL}/api/admin/teaching/api-key/test", headers=HDR)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data
        assert "source" in data
        assert data["source"] in ("custom", "emergent_universal", "openai_env")
        assert "model_used" in data
