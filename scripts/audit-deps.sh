#!/bin/bash
# TPD-20 FIX (Audit v2 · Phase 4): Dependency vulnerability audit
echo "=== Dependency Audit ==="
bun audit 2>&1 || echo "⚠ bun audit found vulnerabilities"
