#!/usr/bin/env python3
"""
Remove @ts-nocheck from line 1 of clean test files.
Keeps @ts-nocheck in the 6 files with known TypeScript errors.
"""

import os
import re

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directories to skip
SKIP_DIRS = {
    "node_modules", ".next", ".git", "dist", "build", ".cache",
    "coverage", ".nyc_output", ".turbo",
}

# The 6 test files that have real TypeScript errors — keep their @ts-nocheck
ERROR_FILES = {
    "__tests__/components/garfix-ds/GarfiXDS.test.tsx",
    "__tests__/p0-regression.test.ts",
    "src/lib/__tests__/db-indexes.test.ts",
    "src/lib/__tests__/db-rls.test.ts",
    "src/lib/__tests__/session-registry.test.ts",
    "src/lib/__tests__/ssrf.test.ts",
}


def is_test_file(path: str) -> bool:
    """Check if a file matches test file patterns."""
    basename = os.path.basename(path)
    if basename.endswith(".test.ts") or basename.endswith(".test.tsx"):
        return True
    # Check if it's inside a __tests__ directory
    parts = path.replace("\\", "/").split("/")
    if "__tests__" in parts:
        return True
    return False


def is_ts_file(path: str) -> bool:
    return path.endswith(".ts") or path.endswith(".tsx")


def find_test_files_with_ts_nocheck(root: str):
    """Walk the project tree to find .ts/.tsx test files with @ts-nocheck on line 1."""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune directories we don't want to traverse
        dirnames[:] = sorted(
            d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")
        )
        for fname in sorted(filenames):
            if not is_ts_file(fname):
                continue
            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(full_path, root)
            if not is_test_file(rel_path):
                continue
            # Read first line
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    first_line = f.readline()
            except (UnicodeDecodeError, PermissionError):
                continue
            if "@ts-nocheck" in first_line:
                results.append(rel_path)
    return results


def remove_ts_nocheck_from_line1(filepath: str) -> bool:
    """Remove @ts-nocheck from line 1 if present. Returns True if modified."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    if not lines:
        return False

    first_line = lines[0]
    if "@ts-nocheck" not in first_line:
        return False

    # Check if line 1 is ONLY the @ts-nocheck comment (possibly with whitespace)
    stripped = first_line.strip()
    if stripped == "// @ts-nocheck" or stripped == "//@ts-nocheck" or stripped == "@ts-nocheck":
        # Remove the entire line
        new_lines = lines[1:]
    else:
        # @ts-nocheck is embedded in something else on line 1 — just remove the @ts-nocheck part
        new_first_line = first_line.replace("@ts-nocheck", "")
        new_lines = [new_first_line] + lines[1:]

    new_content = "\n".join(new_lines)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    return True


def main():
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Scanning for test files with @ts-nocheck on line 1...")

    all_files = find_test_files_with_ts_nocheck(PROJECT_ROOT)
    print(f"\nFound {len(all_files)} test files with @ts-nocheck on line 1:\n")

    skip_list = []
    modify_list = []

    for rel in sorted(all_files):
        if rel in ERROR_FILES:
            skip_list.append(rel)
        else:
            modify_list.append(rel)

    print(f"=== SKIPPING (have real TS errors) — {len(skip_list)} files ===")
    for f in skip_list:
        print(f"  [SKIP] {f}")

    print(f"\n=== REMOVING @ts-nocheck (clean) — {len(modify_list)} files ===")
    modified = 0
    issues = []
    for rel in modify_list:
        full = os.path.join(PROJECT_ROOT, rel)
        try:
            result = remove_ts_nocheck_from_line1(full)
            if result:
                modified += 1
                print(f"  [OK]   {rel}")
            else:
                issues.append(f"  [WARN] {rel} — @ts-nocheck was not on a removable line 1")
        except Exception as e:
            issues.append(f"  [ERR]  {rel} — {e}")

    print(f"\n{'='*60}")
    print(f"Total test files with @ts-nocheck: {len(all_files)}")
    print(f"Skipped (have errors):              {len(skip_list)}")
    print(f"Modified (clean):                    {modified}")
    if issues:
        print(f"\nIssues ({len(issues)}):")
        for i in issues:
            print(i)
    print(f"\nDone.")


if __name__ == "__main__":
    main()
