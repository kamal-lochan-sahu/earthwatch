#!/usr/bin/env python3
"""
EarthWatch — Step 8: Repo structure cleanup
- Remove backend/.gitignore (empty, redundant with root .gitignore)
- Remove frontend/README.md (unedited create-next-app boilerplate;
  root README.md already documents frontend + backend setup)
- Rewrite root .gitignore: it's currently a corrupted mix of a UTF-16
  encoded gitignore (from some past Windows-tool edit) followed by a
  plain UTF-8 tail, concatenated without conversion. Because of this,
  every rule in the UTF-16 portion (node_modules/, Thumbs.db, .env.local,
  backend/venv/) is INERT — git only actually applies the small UTF-8
  tail (__pycache__/, *.pyc, *.pyo, .env, venv/, .DS_Store). This
  rewrites it as one clean UTF-8 file with every rule actually working,
  plus adds .pytest_cache/ (gap found: pytest creates this locally and
  it wasn't excluded).
Run this from the ROOT of your local earthwatch repo.
"""
import os
import sys
import subprocess

if not os.path.isdir("backend") or not os.path.isdir("frontend"):
    print("ERROR: run this from the root of the earthwatch repo (backend/, frontend/ not found).")
    sys.exit(1)

removed = []

for path in ["backend/.gitignore", "frontend/README.md"]:
    if os.path.isfile(path):
        subprocess.run(["git", "rm", "-q", path], check=True)
        removed.append(path)
    else:
        print(f"SKIP: {path} already gone")

# Rewrite root .gitignore as one clean, working UTF-8 file
new_gitignore = """# Python
__pycache__/
*.pyc
*.pyo
venv/
.pytest_cache/

# Node
node_modules/

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db
"""

with open(".gitignore", "wb") as f:
    f.write(new_gitignore.encode("utf-8"))

print("OK: rewrote root .gitignore as clean UTF-8 (all rules now actually work, added .pytest_cache/)")

if removed:
    print(f"OK: removed {', '.join(removed)}")

print("")
print("Review with: git status  (and: git diff --stat .gitignore)")
print('Then: git add -A && git commit -m "chore: fix corrupted .gitignore encoding, clean up repo structure" && git push')
print("")
print("Also worth a quick eyeball on your machine — run 'git status' right now (before staging)")
print("and tell me if anything unexpected shows up as untracked (stray files from earlier steps, etc.)")
