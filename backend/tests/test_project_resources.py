import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app


class TestProjectAndResources(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_project_crud_and_resources(self):
        # 1. Create a project
        p_res = self.client.post(
            "/api/v1/projects",
            json={
                "name": "Palm Jumeirah Luxury Villa",
                "client": "Nakheel Development",
                "code": "PRJ-2024-888",
                "priority": "High",
                "priority_level": "high",
            }
        )
        self.assertEqual(p_res.status_code, 201)
        p_data = p_res.json()
        self.assertIn("project_key", p_data)
        pk = p_data["project_key"]

        # 2. Get project details
        get_res = self.client.get(f"/api/v1/projects/{pk}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["name"], "Palm Jumeirah Luxury Villa")
        self.assertEqual(get_res.json()["resource_items"], [])

        # 3. Add members (from Manpower with hours worked 1-9)
        r1_res = self.client.post(
            f"/api/v1/projects/{pk}/resources",
            json={
                "name": "Ahmed Al-Mansoor",
                "type": "Internal",
                "hours_worked": 8,
            }
        )
        self.assertEqual(r1_res.status_code, 201)
        r1_data = r1_res.json()
        self.assertEqual(r1_data["name"], "Ahmed Al-Mansoor")
        self.assertEqual(r1_data["type"], "Internal")
        self.assertEqual(r1_data["hours_worked"], 8)

        r2_res = self.client.post(
            f"/api/v1/projects/{pk}/resources",
            json={
                "name": "Vikram Patel",
                "type": "External",
                "hours_worked": 6,
            }
        )
        self.assertEqual(r2_res.status_code, 201)
        r2_data = r2_res.json()
        self.assertEqual(r2_data["hours_worked"], 6)

        # 4. List resources
        list_res = self.client.get(f"/api/v1/projects/{pk}/resources")
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 2)

        # 5. Delete a resource member
        del_res = self.client.delete(f"/api/v1/projects/{pk}/resources/{r1_data['id']}")
        self.assertEqual(del_res.status_code, 200)

        # 6. Verify remaining resource
        list_res_after = self.client.get(f"/api/v1/projects/{pk}/resources")
        self.assertEqual(len(list_res_after.json()), 1)
        self.assertEqual(list_res_after.json()[0]["name"], "Vikram Patel")

if __name__ == "__main__":
    unittest.main()
