"""Seed a ready-to-demo account, sample activities, and one optimization run.

Usage (from backend/, with backend/.env configured and the database reachable):
    python scripts/seed_demo.py

Safe to re-run: existing demo data is reused, never duplicated. It also syncs the
stored simulation config (zone + baseline) with DEFAULT_ZONE / BASELINE_INTENSITY
from your environment, which the app otherwise only reads once at first start.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from services.carbon_service import _DEFAULT_ZONE_ID  # noqa: E402

DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@ecotime.app")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "EcoTime@Demo1")
BASELINE = float(os.getenv("BASELINE_INTENSITY", "650"))

ACTIVITIES = [
    # name, type, minutes, priority, flexibility, activityType
    ("Nightly cloud backup", "flexible", 60, 20, 95, "cloud-backup"),
    ("ML model training run", "flexible", 90, 30, 85, "batch-processing"),
    ("Dataset download", "flexible", 45, 25, 90, "dataset-download"),
    ("OS software update", "flexible", 30, 40, 80, "software-update"),
    ("CI/CD regression suite", "flexible", 40, 50, 70, "ci-cd-pipeline"),
    ("Production hotfix deploy", "non-flexible", 20, 95, 5, "ci-cd-pipeline"),
]


def main() -> int:
    app = create_app(os.getenv("FLASK_ENV", "development"))
    client = app.test_client()

    login = client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if login.status_code != 200:
        login = client.post("/api/auth/register", json={
            "email": DEMO_EMAIL, "password": DEMO_PASSWORD,
            "first_name": "Demo", "last_name": "User", "organization_name": "EcoTime Demo Org",
        })
    if login.status_code not in (200, 201):
        print("Could not log in or register the demo user:", login.get_json())
        return 1
    headers = {"Authorization": f"Bearer {login.get_json()['token']}"}

    cfg = client.post("/api/config/simulation", headers=headers, json={
        "zone": _DEFAULT_ZONE_ID, "baselineIntensity": BASELINE,
    })
    print(f"Config -> zone={_DEFAULT_ZONE_ID} baseline={BASELINE}: HTTP {cfg.status_code}")

    def list_activities() -> list[dict]:
        data = (client.get("/api/activities?pageSize=100", headers=headers).get_json() or {}).get("data", {})
        return data.get("items", []) if isinstance(data, dict) else data

    items = list_activities()
    if not items:
        for name, kind, minutes, priority, flexibility, activity_type in ACTIVITIES:
            r = client.post("/api/activities", headers=headers, json={
                "name": name, "type": kind, "duration": minutes, "priorityScore": priority,
                "flexibilityScore": flexibility, "activityType": activity_type,
            })
            print(f"  + {name}: HTTP {r.status_code}")
        items = list_activities()
    else:
        print(f"Reusing {len(items)} existing activities")

    ids = [a["id"] for a in items]
    run = client.post("/api/recommendations", headers=headers, json={
        "tasks": [{"id": i} for i in ids], "method": "knapsack",
        "zone": _DEFAULT_ZONE_ID, "baselineIntensity": BASELINE,
    })
    print("Optimization run: HTTP", run.status_code)

    scheduled = 0
    for a in items:
        if a.get("type") == "flexible" and a.get("status") in ("idle", "pending") and scheduled < 2:
            r = client.post(f"/api/activities/{a['id']}/schedule", headers=headers, json={"zone": _DEFAULT_ZONE_ID})
            if r.status_code == 200 and (r.get_json().get("data") or {}).get("scheduled"):
                scheduled += 1
    print(f"Scheduled {scheduled} activities (awards EcoPoints)")
    print(f"\nDemo login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
