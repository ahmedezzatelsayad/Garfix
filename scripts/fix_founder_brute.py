#!/usr/bin/env python3
"""Brute-force: find and replace all (db as unknown as { ... }).companyMembership patterns."""
import re, os

ROOT = "/home/z/my-project/src/app/api"
FIXES = 0

for dirpath, _, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith(".ts"): continue
        fp = os.path.join(dirpath, fn)
        with open(fp) as f:
            c = f.read()
        original = c
        
        # Repeatedly remove casts until none remain
        while True:
            # Find '(db as unknown as {' ... '})' spanning multiple lines
            # The closing is }).companyMembership or }).companyMember
            new = re.sub(
                r'\(db\s+as\s+unknown\s+as\s*\{[^}]*\}\s*\)',
                'db',
                c,
                flags=re.DOTALL
            )
            if new == c:
                break
            c = new
        
        if c != original:
            with open(fp, "w") as f:
                f.write(c)
            FIXES += 1
            print(f"  ✓ {fp.replace('/home/z/my-project/', '')}")

print(f"\nTotal: {FIXES} fixes")
