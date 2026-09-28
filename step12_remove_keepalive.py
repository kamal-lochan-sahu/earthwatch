#!/usr/bin/env python3
"""
EarthWatch — Step 12: Remove the in-app KeepAlive ping

Now that an external service (UptimeRobot) pings /health every 5 minutes
to keep the Render backend awake, the frontend's own KeepAlive component
(pinging every 14 min, only while a tab is open) is redundant. Removing
it means the only traffic hitting the backend is: UptimeRobot's health
check, and real visitors' actual data requests — nothing extra.

Run this from the ROOT of your local earthwatch repo.
"""
import os
import sys
import subprocess

LAYOUT = os.path.join("frontend", "app", "layout.tsx")
KEEPALIVE = os.path.join("frontend", "app", "components", "KeepAlive.tsx")

if not os.path.isfile(LAYOUT):
    print("ERROR: run this from the root of the earthwatch repo (frontend/app/layout.tsx not found).")
    sys.exit(1)

with open(LAYOUT, "r", encoding="utf-8") as f:
    content = f.read()

changes = 0

old_import = 'import "./globals.css";\nimport KeepAlive from "./components/KeepAlive";'
new_import = 'import "./globals.css";'
if old_import in content:
    content = content.replace(old_import, new_import, 1)
    changes += 1
else:
    print("SKIP: KeepAlive import line doesn't match expected text — check layout.tsx manually.")

old_usage = '        <KeepAlive />\n        {children}'
new_usage = '        {children}'
if old_usage in content:
    content = content.replace(old_usage, new_usage, 1)
    changes += 1
else:
    print("SKIP: <KeepAlive /> usage doesn't match expected text — check layout.tsx manually.")

with open(LAYOUT, "w", encoding="utf-8") as f:
    f.write(content)

if changes == 2:
    print("OK: layout.tsx — removed KeepAlive import and usage")

if os.path.isfile(KEEPALIVE):
    subprocess.run(["git", "rm", "-q", KEEPALIVE], check=True)
    print(f"OK: removed {KEEPALIVE}")
else:
    print(f"SKIP: {KEEPALIVE} already gone")

print("")
print("Review with: git diff --cached  (and: git status)")
print("Then: git add -A")
print('git commit -m "chore: remove in-app KeepAlive ping — UptimeRobot pings /health externally now"')
print("git push")
