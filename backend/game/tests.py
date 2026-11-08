from rest_framework.test import APITestCase


class ApiTests(APITestCase):
    def test_content_is_seeded(self):
        res = self.client.get("/api/content/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["unit_types"]), 4)
        self.assertTrue(any(c["faction"] == "enemy" for c in res.data["commanders"]))
        self.assertEqual(res.data["scenarios"][0]["key"], "ashen-marches")

    def test_campaign_save_and_reports(self):
        res = self.client.post(
            "/api/campaigns/",
            {"name": "Test", "scenario": "ashen-marches", "state": {"time": 1}},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        cid = res.data["id"]
        res = self.client.patch(f"/api/campaigns/{cid}/", {"game_time": 42, "state": {"time": 42}}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["state"], {"time": 42})
        res = self.client.post(
            f"/api/campaigns/{cid}/battle-reports/",
            {
                "game_time": 40, "location": "Oszvald", "kind": "siege", "outcome": "captured",
                "player_force": "1st Army", "enemy_force": "Garrison",
                "player_losses": 10, "enemy_losses": 200,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        stats = self.client.get(f"/api/campaigns/{cid}/stats/").data
        self.assertEqual(stats["won"], 1)
        self.assertEqual(stats["enemy_losses"], 200)
        # Destructive / enumerating endpoints are not exposed.
        self.assertEqual(self.client.get("/api/campaigns/").status_code, 405)
        self.assertEqual(self.client.delete(f"/api/campaigns/{cid}/").status_code, 405)
        self.assertEqual(self.client.put(f"/api/campaigns/{cid}/", {}, format="json").status_code, 405)
        big = {"blob": "x" * (70 * 1024)}
        self.assertEqual(self.client.patch(f"/api/campaigns/{cid}/", {"state": big}, format="json").status_code, 400)

    def test_generated_campaign_without_scenario(self):
        res = self.client.post(
            "/api/campaigns/",
            {"name": "Alliance", "mode": "alliance", "seed": 99, "scenario": None, "state": {"time": 0}},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["mode"], "alliance")
        self.assertIsNone(res.data["scenario_name"])
