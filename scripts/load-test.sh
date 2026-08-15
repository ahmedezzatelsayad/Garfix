#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# GarfiX EOS v12.1 — Load Test Script
# ══════════════════════════════════════════════════════════════════════════════
#
# This script performs load testing on the GarfiX application using:
#   - curl (for basic HTTP testing)
#   - ab (Apache Benchmark, if available)
#   - k6 (if installed)
#
# Usage:
#   ./load-test.sh [target_url]
#
# Examples:
#   ./load-test.sh http://localhost:3000
#   ./load-test.sh https://staging.garfix.com
#
# Prerequisites:
#   - Application running (bun run start or bun run dev)
#   - Optional: ab, k6 for advanced testing
# ══════════════════════════════════════════════════════════════════════════════

set -e

# ─── Configuration ──────────────────────────────────────────────────────────

TARGET_URL="${1:-http://localhost:3000}"
RESULTS_DIR="./load-test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Test parameters
CONCURRENT_USERS=(10 25 50 100)
DURATION="30s"
WARMUP_DURATION="5s"

# Endpoints to test
ENDPOINTS=(
  "/"
  "/api/health"
  "/api/startup-check"
  "/api/founder-panel/mission-control"
  "/login"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Helper Functions ───────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

create_results_dir() {
  mkdir -p "$RESULTS_DIR"
  log_info "Results will be saved to: $RESULTS_DIR/"
}

check_target() {
  log_info "Checking target availability: $TARGET_URL"
  
  if curl -sf --max-time 5 "$TARGET_URL" > /dev/null 2>&1; then
    log_success "Target is reachable"
    return 0
  else
    log_error "Target is not reachable!"
    exit 1
  fi
}

# ─── Basic HTTP Tests ─────────────────────────────────────────────────────

test_basic_connectivity() {
  log_info "\n═══ Basic Connectivity Tests ═══\n"
  
  local results_file="$RESULTS_DIR/basic_$TIMESTAMP.txt"
  
  for endpoint in "${ENDPOINTS[@]}"; do
    local url="${TARGET_URL}${endpoint}"
    local status_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
    local time_total=$(curl -sf -o /dev/null -w "%{time_total}" --max-time 10 "$url" 2>/dev/null || echo "0.000")
    
    if [[ "$status_code" == "2"* ]] || [[ "$status_code" == "3"* ]]; then
      log_success "$endpoint → $status_code (${time_total}s)"
    elif [[ "$status_code" == "000" ]]; then
      log_warning "$endpoint → No response (timeout/connection error)"
    else
      log_error "$endpoint → $status_code (${time_total}s)"
    fi
    
    echo "$endpoint,$status_code,$time_total" >> "$results_file"
  done
  
  log_success "Basic test results saved to: $results_file"
}

# ─── Concurrent Request Tests ─────────────────────────────────────────────

test_concurrent_requests() {
  log_info "\n═══ Concurrent Request Tests ═══\n"
  
  local results_file="$RESULTS_DIR/concurrent_$TIMESTAMP.csv"
  echo "endpoint,users,requests,failed,req/s,time_avg,time_p95,time_p99" > "$results_file"
  
  for endpoint in "/" "/api/health" "/api/startup-check"; do
    local url="${TARGET_URL}${endpoint}"
    
    for users in "${CONCURRENT_USERS[@]}"; do
      log_info "Testing $endpoint with $users concurrent users..."
      
      # Use curl for concurrent requests (simple implementation)
      local total_requests=$((users * 10))
      local successful=0
      local failed=0
      local total_time=0
      
      # Run requests in background and collect timing
      temp_file=$(mktemp)
      
      for ((i=1; i<=total_requests; i++)); do (
        start_time=$(date +%s%N)
        status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 30 "$url" 2>/dev/null || echo "000")
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 )) # Convert to ms
        
        echo "$status,$elapsed" >> "$temp_file"
      ) &
        
        # Limit concurrency
        if (( i % users == 0 )); then
          wait
        fi
      done
      
      wait
      
      # Process results
      while IFS=',' read -r status time; do
        if [[ "$status" == "2"* ]]; then
          ((successful++))
          total_time=$((total_time + time))
        else
          ((failed++))
        fi
      done < "$temp_file"
      
      rm -f "$temp_file"
      
      # Calculate metrics
      if [[ $successful -gt 0 ]]; then
        avg_time=$((total_time / successful))
      else
        avg_time=0
      fi
      
      req_per_sec=$((successful * 1000 / (DURATION_INT * 1000)))  # Approximate
      
      log_success "$endpoint @ ${users} users → ${successful}/${total_requests} success (${avg_time}ms avg)"
      echo "$endpoint,$users,$total_requests,$failed,$req_per_sec,$avg_time,0,0" >> "$results_file"
    done
  done
  
  log_success "Concurrent test results saved to: $results_file"
}

# ─── Apache Benchmark (if available) ──────────────────────────────────────

test_with_ab() {
  if ! command -v ab &> /dev/null; then
    log_warning "Apache Bench (ab) not found. Skipping ab tests."
    return
  fi
  
  log_info "\n═══ Apache Benchmark Tests ═══\n"
  
  local results_file="$RESULTS_DIR/ab_$TIMESTAMP.txt"
  
  for endpoint in "/" "/api/health"; do
    local url="${TARGET_URL}${endpoint}"
    
    for users in 10 50 100; do
      local requests=$((users * 20))
      
      log_info "ab -n $requests -c $users $url"
      
      ab -n $requests -c $users -q "$url" >> "$results_file" 2>&1 || true
      
      # Extract key metrics from output
      local rps=$(grep "Requests per second" "$results_file" | tail -1 | awk '{print $4}')
      local avg=$(grep "Time per request.*mean" "$results_file" | tail -1 | awk '{print $4}')
      
      log_success "$endpoint @ ${users} concurrent → ${rps:-N/A} req/s, ${avg:-N/A}ms avg"
    done
  done
  
  log_success "ab results saved to: $results_file"
}

# ─── k6 Tests (if available) ──────────────────────────────────────────────

test_with_k6() {
  if ! command -v k6 &> /dev/null; then
    log_warning "k6 not found. Skipping k6 tests."
    return
  fi
  
  log_info "\n═══ k6 Load Tests ═══\n"
  
  # Create k6 test script
  local k6_script="$RESULTS_DIR/k6_test_$TIMESTAMP.js"
  
  cat > "$k6_script" << 'EOF'
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Ramp up
    { duration: '30s', target: 50 },  // Sustained load
    { duration: '10s', target: 100 }, // Peak load
    { duration: '10s', target: 0 },   // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const TARGET = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  const endpoints = [
    '/',
    '/api/health',
    '/api/startup-check',
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  
  const res = http.get(`${TARGET}${endpoint}`);
  
  check(res, {
    'status was 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
EOF
  
  log_info "Running k6 with target: $TARGET_URL"
  TARGET_URL="$TARGET_URL" k6 run --summary-export="$RESULTS_DIR/k6_summary_$TIMESTAMP.json" "$k6_script" \
    2>&1 | tee "$RESULTS_DIR/k6_output_$TIMESTAMP.txt" || true
  
  log_success "k6 results saved to: $RESULTS_DIR/k6_*_$TIMESTAMP.*"
}

# ─── Mission Control API Stress Test ──────────────────────────────────────

test_mission_control_api() {
  log_info "\n═══ Mission Control API Stress Test ═══\n"
  
  local url="${TARGET_URL}/api/founder-panel/mission-control"
  local results_file="$RESULTS_DIR/mission_control_$TIMESTAMP.csv"
  echo "timestamp,status,response_time_ms" > "$results_file"
  
  log_info "Sending 50 rapid requests to Mission Control API..."
  
  for i in $(seq 1 50); do
    start_time=$(date +%s%N)
    
    response=$(curl -sf --max-time 30 -w "\n%{http_code}%{time_total}" "$url" 2>/dev/null || echo "000\n0.000")
    
    end_time=$(date +%s%N)
    
    status=$(echo "$response" | tail -2 | head -1)
    curl_time=$(echo "$response" | tail -1)
    elapsed=$(( (end_time - start_time) / 1000000 ))
    
    echo "$(date +%H:%M:%S),$status,$elapsed" >> "$results_file"
    
    if [[ $((i % 10)) -eq 0 ]]; then
      log_info "  Completed $i/50 requests..."
    fi
  done
  
  # Calculate summary
  total_time=$(awk -F',' 'NR>1{sum+=$3} END{print sum}' "$results_file")
  count=$(wc -l < "$results_file")
  avg_time=$((total_time / (count - 1)))
  
  log_success "Mission Control stress test complete:"
  log_info "  Total requests: $((count-1))"
  log_info "  Average response: ${avg_time}ms"
  log_info "  Results saved to: $results_file"
}

# ─── Summary Report ───────────────────────────────────────────────────────

generate_summary() {
  log_info "\n══════════════════════════════════════════"
  log_info "       LOAD TEST SUMMARY REPORT"
  log_info "══════════════════════════════════════════"
  log_info ""
  log_info "Target URL:     $TARGET_URL"
  log_info "Timestamp:      $(date)"
  log_info "Results Dir:    $RESULTS_DIR/"
  log_info ""
  log_info "Files Generated:"
  ls -la "$RESULTS_DIR/"*_$TIMESTAMP* 2>/dev/null | while read line; do
    log_info "  $line"
  done
  log_info ""
  log_info "══════════════════════════════════════════"
}

# ─── Main Execution ───────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║     GarfiX EOS v12.1 — Load Testing Suite               ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  
  create_results_dir
  check_target
  
  # Run tests
  test_basic_connectivity
  test_concurrent_requests
  test_with_ab
  test_with_k6
  test_mission_control_api
  
  # Generate summary
  generate_summary
  
  log_success "\nLoad testing complete! Review results in: $RESULTS_DIR/"
}

main "$@"
