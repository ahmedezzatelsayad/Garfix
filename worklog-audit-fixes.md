---
Task ID: audit-fixes-sprint-2
Agent: Main Agent
Task: Fix all remaining audit findings from the 116-item audit report

Work Log:
- Explored codebase to identify which Critical/High/Medium/Low issues were already fixed vs still open
- Found jwt.verify already has algorithms:["HS256"] (not vulnerable)
- Found founder-panel routes already use requireFounder (not missing auth)
- Found suppliers/recurring endpoints already have IDOR protection
- Fixed getClientIp trust: auth.ts now delegates to rateLimit.ts spoof-resistant getClientIp()
- Fixed register/route.ts: replaced raw x-real-ip header with getClientIp() from rateLimit
- Fixed console.log leak in AIPersonalizationProvider.tsx (replaced with no-op)
- Fixed db-rls-extension.ts: converted $executeRawUnsafe to $executeRaw tagged template
- Fixed health endpoint: stripped commitSha, buildTime, systemTotalMB, heapTotalMB from unauthenticated response
- Deleted dead code: src/lib/with-tenant.ts (zero imports)
- Deleted .github/workflows/cd.yml.DEPRETATED (contained CI secrets, not executed)
- Fixed .env.example: changed FOUNDER_PASSWORD from realistic-looking password to REPLACE_WITH_STRONG_PASSWORD
- Fixed <img> tags: added proper alt, width, height attributes in AICopilotBubble.tsx and AiProviderSettings.tsx
- Moved @tanstack/react-query-devtools from dependencies to devDependencies in package.json
- Enabled @next/next/no-img-element ESLint rule (warn level)
- Fixed e-invoicing webhooks: strengthened recordReceipt() to ALWAYS derive companySlug from DB when invoiceId present, never trust payload
- Documented backup.ts $executeRawUnsafe as intentional (SQLite VACUUM INTO requires string literal)
- Added SEO metadata to 10 public pages (5 directly + 5 via layout.tsx wrappers)
- Created accountingTx() helper with Serializable isolation + retry logic
- Applied Serializable isolation to: journal-entries, inter-company settlement, fiscal year close/reopen

Stage Summary:
- 20+ audit findings addressed across Critical/High/Medium/Low priorities
- Key security fixes: IP trust, webhook tenant isolation, health info leak, transaction isolation
- Code quality: dead code removal, console.log cleanup, ESLint enforcement, dependency hygiene
- SEO: 10 public pages now have proper Arabic metadata
- New file: src/lib/accounting/tx.ts (Serializable transaction helper)
- 5 new layout.tsx files for client-component pages that needed SEO metadata
