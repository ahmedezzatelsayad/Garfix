#!/usr/bin/env python3
"""Fix founder-panel by removing db casts line-by-line."""
import os

ROOT = "/home/z/my-project/src/app/api/founder-panel"
FIXES = 0

def remove_cast(content):
    lines = content.split("\n")
    result = []
    skip_until_paren_close = False
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Detect start of cast: (db as unknown as {
        if '(db as unknown as {' in line or '(db as unknown as {' in line or '(db as  {' in line:
            # Find where the cast starts and ends
            # Replace 'db as unknown as {' with 'db' and track paren depth
            new_line = line.replace('(db as unknown as {', '(db as unknown as {').replace('(db as  {', 'db')
            
            # Actually, we need to find the matching }) and the .companyMember(ship) call
            # Simpler approach: mark for removal and reconstruct
            result.append('CAST_START')
            skip_until_paren_close = True
            i += 1
            continue
        
        if skip_until_paren_close:
            if '}).' in line:
                # End of cast: line like '}).companyMembership.findFirst({'
                # Extract everything after '}).'
                after_paren = line.split('}).', 1)[1] if '}).' in line else ''
                result.append(after_paren.lstrip())
                skip_until_paren_close = False
            # Skip lines that are part of the cast type
            i += 1
            continue
        
        result.append(line)
        i += 1
    
    # Clean up CAST_START markers and NOTE comments
    output = []
    for line in result:
        if line == 'CAST_START':
            output.append('db')
        elif 'companyMember' in line and 'NOTE:' not in line and '// Verify' not in line and '// BUG' not in line:
            output.append(line.replace('.companyMember', '.companyMembership'))
        else:
            output.append(line)
    
    return "\n".join(output)

for dirpath, _, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith(".ts"): continue
        fp = os.path.join(dirpath, fn)
        with open(fp) as f:
            c = f.read()
        if '(db as' not in c:
            continue
        new_c = remove_cast(c)
        if new_c != c:
            with open(fp, "w") as f:
                f.write(new_c)
            FIXES += 1
            print(f"  ✓ {fn}")

# Also fix platform-admin tickets
fp = "/home/z/my-project/src/app/api/platform-admin/tickets/[id]/replies/route.ts"
if os.path.exists(fp):
    with open(fp) as f:
        c = f.read()
    if '(db as' in c:
        new_c = remove_cast(c)
        if new_c != c:
            with open(fp, "w") as f:
                f.write(new_c)
            FIXES += 1
            print(f"  ✓ tickets/[id]/replies/route.ts")

print(f"\nTotal: {FIXES} fixes")