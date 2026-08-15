# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Active |
| < 0.2   | ❌ Not supported |

## Reporting a Vulnerability

If you discover a security vulnerability in GarfiX ERP:

1. **DO NOT** open a public GitHub issue
2. Email: `security@garfix.app`
3. Include:
   - Description of the vulnerability
   - Steps to reproduce (proof of concept)
   - Affected files/versions
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix or mitigation**: within 30 days (severity-dependent)
- **Public disclosure**: after fix is deployed, coordinated with reporter

### Scope

**In scope**:
- SQL injection
- Cross-tenant data access (IDOR)
- Authentication/authorization bypass
- XSS / CSRF bypass
- Secret leakage in source code or responses
- Rate-limiting bypass
- E-invoicing signature forgery

**Out of scope**:
- Self-XSS (requires user to paste payload into their own browser)
- Rate-limiting via distributed botnet (IP rotation)
- Issues in third-party dependencies (report to upstream)
- Social engineering attacks

## Security Measures

### Authentication
- JWT (HS256) with access (30 min) + refresh (30 days) tokens
- Refresh-token rotation on every silent refresh
- Session registry with Valkey-cached validation (10s TTL)
- Password policy: 10+ chars, upper/lower/digit/symbol, score ≥ 40

### Authorization
- Per-company `companySlug` scoping on all tenant data
- `requirePermission()` / `requirePermissionForCompany()` in every route
- Founder bypass via `isFounderEmail()` (not `user.role === "founder"`)

### Input Validation
- Zod schemas on all POST/PATCH/PUT bodies
- `parseJsonBody()` enforces 1 MiB body-size limit
- SQL injection: Prisma parameterized queries (no raw SQL with user input)

### CSRF
- Double-submit cookie pattern (`inv_csrf` cookie + `X-CSRF-Token` header)
- CSRF cookie: `sameSite: strict`, `httpOnly: false` (JS must read it)

### CSP
- Production: `script-src 'self' 'nonce-{random}' 'unsafe-inline'`
- Nonce generated per-request in middleware, passed to layout via `next/headers`
- `'unsafe-inline'` kept as fallback (Next.js RSC payload limitation)

### Rate Limiting
- Per-user: `rateLimitResponse()` on login, signup, AI, password-reset
- Per-company: `checkAndRecordRateLimit()` on AI endpoints (Valkey sliding window)
- Per-IP: Nginx `limit_req` at the edge (in production)

### Secrets
- JWT secrets: `JWT_SECRET` + `JWT_REFRESH_SECRET` (≥ 16 chars, fail-fast in prod)
- Encryption: `PAYMENTS_ENC_KEY` (≥ 32 chars, AES-256-GCM)
- No secrets committed to git (TruffleHog + Gitleaks in CI, no `continue-on-error`)
- Production secrets in AWS SSM Parameter Store (`/garfix/prod/*`)
