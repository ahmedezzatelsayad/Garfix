#!/bin/bash
DIR="src/lib/founder-validation/__tests__/deep"

# Rewrite all deep test files to match the actual API:
# - TelemetryCollector(companies) not TelemetryCollector()
# - tc.entries (private) - need to use generateAll which calls record internally
# - calculateMetrics(telemetry, companies) not calculateMetrics(companies, telemetry)
# - generateFounderReport(companies, telemetry, seed) not generateFounderReport(companies, telemetry, metrics, config)

# Check if TelemetryCollector has generateAll method
if rg -q 'generateAll' src/lib/founder-validation/index.ts; then
  echo "generateAll exists"
else
  echo "generateAll NOT found, checking for generate..."
  rg 'generate.*company|generate.*from' src/lib/founder-validation/index.ts | head -5
fi

# Check TelemetryCollector entries access
rg -n 'entries' src/lib/founder-validation/index.ts | head -10

