"""
Automated Unit & Integration Tests for Antigravity OpenClaw.
"""

import os
import sys
import unittest
import asyncio
from pathlib import Path

# Ensure backend can be imported and isolated test DB is used
BASE_TEST_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_TEST_DIR.parent))

# Use isolated test database so production data/openclaw.db is never touched
TEST_DB_PATH = BASE_TEST_DIR / "test_openclaw.db"
os.environ["OPENCLAW_DB_PATH"] = str(TEST_DB_PATH)

from backend.config import DATA_DIR
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

    @classmethod
    def tearDownClass(cls):
        for f in [TEST_DB_PATH, TEST_DB_PATH.with_suffix(".db-wal"), TEST_DB_PATH.with_suffix(".db-shm")]:
            if f.exists():
                try:
                    f.unlink()
                except Exception:
                    pass

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

    def test_05_antigravity_commands_and_skills(self):
        async def run_checks():
            # Check skills
            skills = await settings_manager_instance.get_skills()
            self.assertIsInstance(skills, list)
            self.assertGreater(len(skills), 0)

            # Check commands
            commands = await settings_manager_instance.get_commands()
            self.assertIsInstance(commands, list)
            self.assertGreater(len(commands), 10)
            
            # Verify /teamwork and /boost are present
            cmd_names = [c["name"] for c in commands]
            self.assertIn("/teamwork", cmd_names)
            self.assertIn("/boost", cmd_names)
            self.assertIn("/plan", cmd_names)
            self.assertIn("/goal", cmd_names)

        asyncio.run(run_checks())

    def test_06_analytics_summary(self):
        from backend.analytics_manager import analytics_manager_instance
        data = analytics_manager_instance.get_summary()
        self.assertTrue(data["success"])
        self.assertIn("kpis", data)
        self.assertIn("timeline", data)
        self.assertIn("projects", data)
        self.assertIn("total_tokens", data["kpis"])
        self.assertIsInstance(data["projects"], list)

    def test_07_projects_manager(self):
        from backend.projects_manager import projects_manager_instance
        projs = projects_manager_instance.list_projects()
        self.assertIsInstance(projs, list)
        self.assertGreaterEqual(len(projs), 1)

        # Test creating project
        created = projects_manager_instance.create_project(
            name="test-unit-project",
            path="/tmp/test-unit-project",
            is_default=False,
            set_active=True
        )
        self.assertEqual(created["name"], "test-unit-project")
        self.assertTrue(created["is_active"])
        proj_id = created["id"]

        # Test active project retrieval
        active = projects_manager_instance.get_active_project()
        self.assertEqual(active["id"], proj_id)

        # Test updating project
        updated = projects_manager_instance.update_project(
            project_id=proj_id,
            name="test-unit-project-renamed"
        )
        self.assertEqual(updated["name"], "test-unit-project-renamed")

        # Test deleting project
        deleted = projects_manager_instance.delete_project(proj_id)
        self.assertTrue(deleted)

import tornado.testing
from backend.app import make_app

class TestHttpRoutes(tornado.testing.AsyncHTTPTestCase):
    def setUp(self):
        init_db()
        create_admin_user("testadmin", "ValidPassword123!", "127.0.0.1")
        super().setUp()

    def get_app(self):
        return make_app()

    def test_routes_status(self):
        res1 = self.fetch('/')
        self.assertEqual(res1.code, 200)
        self.assertIn(b'OpenClaw', res1.body)

        res2 = self.fetch('/app')
        self.assertEqual(res2.code, 200)
        self.assertIn(b'OpenClaw', res2.body)

        res3 = self.fetch('/favicon.ico')
        self.assertEqual(res3.code, 200)

        res4 = self.fetch('/api/health')
        self.assertEqual(res4.code, 200)

        # Secured endpoints require auth
        res5 = self.fetch('/api/antigravity/auth/status')
        self.assertEqual(res5.code, 401)

        res6 = self.fetch('/api/terminal/input', method='POST', body='{}')
        self.assertEqual(res6.code, 401)

        res7 = self.fetch('/api/settings/remote-control')
        self.assertEqual(res7.code, 401)

        res8 = self.fetch('/api/settings/changelog')
        self.assertEqual(res8.code, 401)

        res9 = self.fetch('/api/settings/plugins/validate', method='POST', body='{}')
        self.assertEqual(res9.code, 401)

        res10 = self.fetch('/api/antigravity/usage')
        self.assertEqual(res10.code, 401)

        res11 = self.fetch('/api/antigravity/commands')
        self.assertEqual(res11.code, 401)

        res12 = self.fetch('/api/antigravity/skills')
        self.assertEqual(res12.code, 401)

        res13 = self.fetch('/api/agent/conversations/nonexistent-id', method='DELETE')
        self.assertEqual(res13.code, 401)

        res14 = self.fetch('/api/projects')
        self.assertEqual(res14.code, 401)

        res15 = self.fetch('/api/teamwork/status')
        self.assertEqual(res15.code, 401)

    def test_projects_http_crud(self):
        import json
        token, _, _ = authenticate_user("testadmin", "ValidPassword123!", "127.0.0.1", "test")
        self.assertIsNotNone(token)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 1. Create project
        create_payload = json.dumps({
            "name": "hello world",
            "path": "",
            "is_default": False,
            "set_active": True
        })
        res_create = self.fetch('/api/projects', method='POST', headers=headers, body=create_payload)
        self.assertEqual(res_create.code, 200)
        data = json.loads(res_create.body.decode('utf-8'))
        self.assertTrue(data.get("success"))
        created = data.get("project")
        self.assertEqual(created["name"], "hello world")
        proj_id = created["id"]

        # 2. Get projects list
        res_list = self.fetch('/api/projects', headers=headers)
        self.assertEqual(res_list.code, 200)
        list_data = json.loads(res_list.body.decode('utf-8'))
        self.assertTrue(any(p["id"] == proj_id for p in list_data.get("projects", [])))

        # 3. Update project
        update_payload = json.dumps({
            "name": "hello world renamed",
            "path": "/tmp/hw",
            "is_default": False,
            "set_active": True
        })
        res_update = self.fetch(f'/api/projects/{proj_id}', method='PUT', headers=headers, body=update_payload)
        self.assertEqual(res_update.code, 200)
        up_data = json.loads(res_update.body.decode('utf-8'))
        self.assertEqual(up_data["project"]["name"], "hello world renamed")

        # 4. Set active project
        active_payload = json.dumps({"project_id": proj_id})
        res_active = self.fetch('/api/projects/active', method='POST', headers=headers, body=active_payload)
        self.assertEqual(res_active.code, 200)

        # 5. Delete project
        res_del = self.fetch(f'/api/projects/{proj_id}', method='DELETE', headers=headers)
        self.assertEqual(res_del.code, 200)

    def test_webhook_notifier_config_and_rules(self):
        import json
        from backend.webhook_notifier import notifier_instance
        from backend.antigravity_runner import ActiveTask

        token, _, _ = authenticate_user("testadmin", "ValidPassword123!", "127.0.0.1", "test")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 1. Update webhook config via API
        payload = json.dumps({
            "generic_url": "https://example.com/webhook",
            "notify_swarms": True,
            "notify_all_tasks": False,
            "notify_approvals": True,
            "min_duration_seconds": 15
        })
        res_post = self.fetch('/api/settings/webhooks', method='POST', headers=headers, body=payload)
        self.assertEqual(res_post.code, 200)

        # 2. Get webhook config
        res_get = self.fetch('/api/settings/webhooks', headers=headers)
        self.assertEqual(res_get.code, 200)
        data = json.loads(res_get.body.decode('utf-8'))
        self.assertEqual(data["generic_url"], "https://example.com/webhook")
        self.assertTrue(data["notify_swarms"])
        self.assertTrue(data["notify_approvals"])
        self.assertEqual(data["min_duration_seconds"], 15)

        # 3. Test should_notify_task rules
        swarm_task = ActiveTask("t1", "c1", "/teamwork Build auth", 1, "test")
        self.assertTrue(notifier_instance.should_notify_task(swarm_task))

        normal_task = ActiveTask("t2", "c2", "say hello", 1, "test")
        normal_task.duration_seconds = 2.0
        self.assertFalse(notifier_instance.should_notify_task(normal_task))

        # Explicit notify requested
        normal_task.webhook_notify = True
        self.assertTrue(notifier_instance.should_notify_task(normal_task))

if __name__ == "__main__":
    unittest.main()

