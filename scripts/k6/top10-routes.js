// P5-P1 FIX (Audit v2 · Phase 5): k6 load testing scripts
// Run: k6 run scripts/k6/top10-routes.js
// CI gate: p95 < 200ms

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency_ms');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 VUs
    { duration: '1m', target: 20 },     // hold at 20 VUs
    { duration: '30s', target: 50 },    // ramp up to 50 VUs
    { duration: '1m', target: 50 },     // hold at 50 VUs
    { duration: '30s', target: 0 },     // ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'],              // < 5% error rate
    latency_ms: ['p(95)<200'],          // p95 < 200ms
    http_req_duration: ['p(95)<200'],
  },
};

const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

const routes = [
  { method: 'GET', url: '/api/health' },
  { method: 'GET', url: '/api/invoices' },
  { method: 'GET', url: '/api/clients' },
  { method: 'GET', url: '/api/catalog' },
  { method: 'GET', url: '/api/inventory' },
  { method: 'GET', url: '/api/accounting/reports/general-ledger' },
  { method: 'GET', url: '/api/reports' },
  { method: 'GET', url: '/api/dashboard' },
  { method: 'GET', url: '/api/employees' },
  { method: 'GET', url: '/api/purchases' },
];

export default function () {
  const route = routes[Math.floor(Math.random() * routes.length)];
  const url = `${BASE_URL}${route.url}`;

  const params = { headers, tags: { route: route.url } };
  const res = route.method === 'GET'
    ? http.get(url, params)
    : http.post(url, JSON.stringify({}), { ...params, headers: { ...headers, 'Content-Type': 'application/json' } });

  latencyTrend.add(res.timings.duration);
  errorRate.add(res.status >= 400);

  check(res, {
    'status is 2xx or 4xx (auth)': (r) => r.status < 500,
  });

  sleep(0.1);
}
