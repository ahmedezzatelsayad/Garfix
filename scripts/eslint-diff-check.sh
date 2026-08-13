#!/bin/bash
# scripts/eslint-diff-check.sh — ADD-2 (Phase 1.5)
# CI Gate: any new or modified file must have 0 errors / 0 warnings on eslint.
# Usage: bash scripts/eslint-diff-check.sh
# Exit 0 = pass, Exit 1 = fail

set -e

# Get changed .ts/.tsx files (staged + unstaged vs HEAD), excluding node_modules
CHANGED=$(git diff --name-only HEAD --diff-filter=AM 2>/dev/null | grep -E '\.(ts|tsx)$' | grep -v node_modules || true)

if [ -z "$CHANGED" ]; then
  echo "✓ No changed TypeScript files to lint"
  exit 0
fi

echo "── ESLint diff check (changed files only) ──"
echo "$CHANGED"
echo ""

# Run eslint with --max-warnings=0 on changed files only
bunx eslint $CHANGED --max-warnings=0
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "✓ All changed files pass eslint (0 errors / 0 warnings)"
  exit 0
else
  echo "❌ Changed files have eslint errors or warnings"
  echo "Fix all errors/warnings in the files above before committing."
  exit 1
fi
