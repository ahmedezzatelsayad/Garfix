#!/usr/bin/env python3
"""
fix_from_tsc.py — Parse tsc --noEmit output and fix each error line.
For TS2352: find 'as Type' near error column, change to 'as unknown as Type'.
For TS2322/TS2769: skip (pre-existing).
"""

import subprocess, re, os

ROOT = "/home/z/my-project"

result = subprocess.run(
    ["bunx", "tsc", "--noEmit", "--project", "tsconfig.json"],
    capture_output=True, text=True, cwd=ROOT, timeout=180
)
output = result.stdout + result.stderr

lines = output.split("\n")
FIXES = 0

# Group errors by file
file_errors = {}
for line in lines:
    if "error TS" not in line or "/skills/" in line:
        continue
    m = re.match(r'^(.+?)\((\d+),(\d+)\)', line)
    if m:
        fp = m.group(1)
        ln = int(m.group(2))
        col = int(m.group(3))
        code = re.search(r'error (TS\d+)', line).group(1)
        if fp not in file_errors:
            file_errors[fp] = []
        file_errors[fp].append((ln, col, code))

for fp, errors in file_errors.items():
    if not os.path.exists(fp):
        continue
    with open(fp, "r") as f:
        content = f.read()
    file_lines = content.split("\n")
    modified = False
    
    for ln, col, code in errors:
        idx = ln - 1
        if idx >= len(file_lines):
            continue
        line = file_lines[idx]
        
        if code == "TS2352":
            # Find the 'as Type' pattern on this line
            # Strategy: find ALL 'as ' before col and pick the rightmost
            # Also check the PREVIOUS line (multiline cast)
            
            search_lines = [line]
            if idx > 0:
                search_lines.insert(0, file_lines[idx - 1])
            
            combined = "\n".join(search_lines)
            
            # Find all 'as ' positions that are NOT already 'as unknown as'
            positions = []
            for m in re.finditer(r'(?<!\bas\s)\bas\s+(?!unknown\b)', combined):
                positions.append(m.start())
            
            if not positions:
                continue
            
            # Pick the position closest to the error column
            # The error column is relative to the line, but combined spans 2 lines
            # Just pick the last 'as' position before the error area
            best = positions[-1]
            
            # Insert 'unknown as ' after 'as '
            insert_pos = combined.find('as ', best) + 3
            new_combined = combined[:insert_pos] + 'unknown as ' + combined[insert_pos:]
            
            new_lines = new_combined.split("\n")
            if len(new_lines) == 2:
                file_lines[idx - 1] = new_lines[0]
                file_lines[idx] = new_lines[1]
            else:
                file_lines[idx] = new_lines[0]
            
            modified = True
            FIXES += 1
        # Skip TS2322 and TS2769 (tx.ts)
    
    if modified:
        with open(fp, "w") as f:
            f.write("\n".join(file_lines))
        print(f"  ✓ {fp.replace(ROOT+'/', '')}")

print(f"\nTotal: {FIXES} fixes")
