#!/bin/bash
# Run each test file in its own process to avoid mock.module() bleed
# Bun's mock.module() is global and persists across all files in one process,
# causing cross-test interference. Running each file separately avoids this.

set -e

PASS=0
FAIL=0
ERRORS=""
TOTAL=0

TEST_DIR="${1:-src}"

# Find all test files (excluding e2e)
FILES=$(find "$TEST_DIR" -name "*.test.*" -o -name "*.spec.*" | grep -v "e2e" | sort)

for f in $FILES; do
    TOTAL=$((TOTAL + 1))
    # Run each test file in its own Bun process
    RESULT=$(timeout 120 bun test "$f" 2>&1)
    # Count passes and fails from the summary line
    PASS_COUNT=$(echo "$RESULT" | grep -oP '\d+ pass' | grep -oP '\d+' || echo "0")
    FAIL_COUNT=$(echo "$RESULT" | grep -oP '\d+ fail' | grep -oP '\d+' || echo "0")
    
    if [ "$FAIL_COUNT" -gt 0 ]; then
        FAIL=$((FAIL + FAIL_COUNT))
        ERRORS="$ERRORS\nFAIL: $f ($FAIL_COUNT failures)"
        echo "❌ $f — $FAIL_COUNT failures"
    else
        PASS=$((PASS + PASS_COUNT))
        echo "✅ $f — $PASS_COUNT pass"
    fi
done

echo ""
echo "========================================="
echo "Total files: $TOTAL"
echo "Total pass:  $PASS"
echo "Total fail:  $FAIL"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
    echo -e "\nFailed files:$ERRORS"
    exit 1
else
    echo "All tests pass!"
    exit 0
fi
