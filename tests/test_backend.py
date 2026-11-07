"""
Automated Unit & Integration Tests for Antigravity OpenClaw.
"""

import os
import sys
import unittest
import asyncio
from pathlib import Path

# Ensure backend can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import DATA_DIR, DB_PATH
from backend.database import init_db, has_any_users, get_db_connection
from backend.auth import (
    create_admin_user, authenticate_user, verify_token, revoke_token, check_ip_lockout, record_login_attempt
)
from backend.audit import log_audit, query_audit_logs, AuditAction
from backend.workspace_manager import workspace_manager_instance
from backend.settings_manager import settings_manager_instance

class TestOpenClawBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_01_user_and_auth(self):
        # 1. Create admin user
        username = "testadmin"
        password = "ValidPassword123!"
        success, msg = create_admin_user(username, password, ip_address="127.0.0.1")
        self.assertTrue(success or "already exists" in msg)
        self.assertTrue(has_any_users())

        # 2. Test successful authentication
        token, user_dict, err = authenticate_user(username, password, "127.0.0.1", "TestAgent/1.0")
        self.assertIsNotNone(token)
        self.assertEqual(user_dict["username"], username)
        self.assertIsNone(err)

        # 3. Test token verification
        payload = verify_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["username"], username)

        # 4. Test token revocation
        revoked = revoke_token(token)
        self.assertTrue(revoked)
        self.assertIsNone(verify_token(token))

        # 5. Test invalid password
        token_bad, _, err_bad = authenticate_user(username, "WrongPassword", "127.0.0.1", "TestAgent/1.0")
        self.assertIsNone(token_bad)
        self.assertIn("Invalid username or password", err_bad)

    def test_02_audit_logging(self):
        log_audit(
            action=AuditAction.SETTINGS_UPDATE,
            status="SUCCESS",
            resource="test_resource",
            username="testadmin",
            ip_address="127.0.0.1",
            details={"setting": "model", "value": "gemini-4-argon-high"}
        )

        res = query_audit_logs(limit=10, action=AuditAction.SETTINGS_UPDATE)
        self.assertGreater(res["total"], 0)
        logs = res["logs"]
        self.assertTrue(any(l["resource"] == "test_resource" for l in logs))

    def test_03_workspace_security(self):
        # 1. Safe write & read
        test_file = "test_scratch.txt"
        success, msg = workspace_manager_instance.write_file(test_file, "Hello Antigravity OpenClaw!")
        self.assertTrue(success)

        success_read, data = workspace_manager_instance.read_file(test_file)
        self.assertTrue(success_read)
        self.assertEqual(data["content"], "Hello Antigravity OpenClaw!")

        # 2. Test Path Traversal Protection
        traversal_path = "../../etc/passwd"
        bad_read, err = workspace_manager_instance.read_file(traversal_path)
        self.assertFalse(bad_read)
        self.assertIn("Access denied", err)

        # Clean up
        workspace_manager_instance.delete_item(test_file)
        if os.path.exists(test_file + ".bak"):
            os.remove(test_file + ".bak")

    def test_04_settings_models(self):
        async def run_models():
            models = await settings_manager_instance.get_models()
            self.assertIsInstance(models, list)
            self.assertGreater(len(models), 0)
        asyncio.run(run_models())

if __name__ == "__main__":
    unittest.main()

