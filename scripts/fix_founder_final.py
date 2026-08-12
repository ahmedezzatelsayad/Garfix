#!/usr/bin/env python3
"""Fix founder-panel: completely remove (db as unknown as { companyMember: ... }) casts."""
import re, os

ROOT = "/home/z/my-project/src/app/api/founder-panel"
FIXES = 0

for dirpath, _, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith(".ts"): continue
        fp = os.path.join(dirpath, fn)
        with open(fp) as f:
            c = f.read()
        original = c
        
        # Remove the entire cast, keeping just 'db'
        # Pattern: (db as unknown as { companyMember: { ... }; }).companyMembership
        # → db.companyMembership
        
        # Step 1: Remove the multiline cast, keeping .companyMembership
        c = re.sub(
            r'\(db\s+as\s+unknown\s+as\s*\{[^}]*companyMembership?[^}]*\}\s*\)\.companyMembership',
            'db.companyMembership',
            c,
            flags=re.DOTALL
        )
        
        # Step 2: Also try removing casts that still have companyMember (not replaced)
        c = re.sub(
            r'\(db\s+as\s+unknown\s+as\s*\{[^}]*companyMember[^}]*\}\s*\)\.companyMembership',
            'db.companyMembership',
            c,
            flags=re.DOTALL
        )
        
        # Step 3: Remove leftover NOTE comments about companyMember
        c = re.sub(
            r'\n\s*// NOTE:.*?companyMember.*?\n',
            '\n',
            c,
            flags=re.DOTALL
        )
        
        if c != original:
            with open(fp, "w") as f:
                f.write(c)
            FIXES += 1
            print(f"  ✓ {fn}")

# Also fix kuwait.ts (missed earlier)
fp = f"{ROOT}/../../lib/e-invoicing/kuwait.ts"
fp2 = "/home/z/my-project/src/lib/e-invoicing/kuwait.ts"
for fp in [fp, fp2]:
    if not os.path.exists(fp): continue
    with open(fp) as f:
        c = f.read()
    if "result as Record<string, unknown>" in c:
        c = c.replace(
            "result as Record<string, unknown>",
            "result as unknown as Record<string, unknown> /* SAFETY: no index sig */"
        )
        with open(fp, "w") as f:
            f.write(c)
        FIXES += 1
        print(f"  ✓ kuwait.ts")

print(f"\nTotal: {FIXES} fixes")
