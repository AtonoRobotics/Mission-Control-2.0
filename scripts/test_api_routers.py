#!/usr/bin/env python3
"""Quick smoke test for all 17 API routers."""
import requests
import sys

BASE = "http://localhost:8000"

login = requests.post(f"{BASE}/api/auth/login", json={
    "email": "admin@mc.local",
    "password": "admin"
})
if login.status_code != 200:
    print(f"FAIL: Login returned {login.status_code}: {login.text}")
    sys.exit(1)

token = login.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

ROUTES = [
    ("auth",          "/api/auth/me"),
    ("users",         "/api/users"),
    ("ros2",          "/api/ros2/status"),
    ("isaac",         "/api/isaac/status"),
    ("containers",    "/api/containers"),
    ("registry",      "/api/registry/robots"),
    ("builds",        "/api/builds"),
    ("workflows",     "/api/workflows/graphs"),
    ("agents",        "/api/agents/logs"),
    ("compute",       "/api/compute/snapshot"),
    ("empirical",     "/api/empirical/robots/dobot_cr10/joints"),
    ("pipelines",     "/api/pipelines"),
    ("recordings",    "/api/recordings"),
    ("cloud",         "/api/cloud/objects"),
    ("layouts",       "/api/layouts"),
    ("robot-builder", "/api/robot-builder/components"),
    ("datasets",      "/api/datasets"),
    ("osmo",          "/api/osmo/pools"),
]

passed = 0
failed = 0
for name, route in ROUTES:
    try:
        r = requests.get(f"{BASE}{route}", headers=headers, timeout=10)
        status = "PASS" if r.status_code < 500 else "FAIL"
        if status == "FAIL":
            failed += 1
        else:
            passed += 1
        print(f"  [{status}] {name:16s} {route:45s} -> {r.status_code}")
    except Exception as e:
        failed += 1
        print(f"  [FAIL] {name:16s} {route:45s} -> {e}")

print(f"\n{passed}/{passed+failed} routers OK")
sys.exit(1 if failed > 0 else 0)
