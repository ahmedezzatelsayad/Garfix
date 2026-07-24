---
Task ID: 1
Agent: Super Z (main)
Task: إضافة ~30 نموذج Prisma مفقود + TanStack Query + Cursor Pagination + Docker verification

Work Log:
- Read existing Prisma schema (41 models) and identified 42 missing models referenced by API routes
- Updated existing models to match API expectations: Account (Int ID, companySlug, nameAr/nameEn, version), Client (Int ID, nameEn), Supplier (Int ID, nameEn, deletedAt), Company (vatNumber, country), Invoice (expanded Kuwait compliance fields), PaymentVoucher (companySlug, bankAccountId), etc.
- Added 42 new models: HR (Employee, Attendance, Salary, Commission, LeaveRequest, Performance, Department), Banking (BankAccount, BankTransaction, BankReconciliation, BankReconciliationMatch), FixedAssets (FixedAsset, DepreciationEntry), CostCenter/Budget (CostCenter, Budget), JournalEntry (JournalEntry, JournalEntryLine), OpeningBalanceEntry, FiscalPeriod, Purchases (PurchaseOrder, PurchaseInvoice), Quotation, TaxFiling, PostDatedCheck, FxRevaluation, LandedCostAllocation, InterCompanyTransaction, WPSFile, RolePermission, EInvoicing (EInvoice, EInvoiceLine, ZATCAConfig), InvoiceTemplate/Settings, Platform (Announcement, SupportTicket, SupportTicketReply), Automation (AutomationRule, AutomationExecution), Webhooks (WebhookEndpoint, WebhookEvent, WebhookDelivery)
- Pushed schema to SQLite DB and generated Prisma Client (83 total models)
- Created Providers.tsx (wrapping ThemeProvider → AuthProvider → QueryProvider → BrandProvider)
- Wired Providers into layout.tsx (was previously missing from app tree)
- Enhanced QueryProvider with React Query Devtools (dev only), staleTime/gcTime defaults
- Created optimistic.ts (optimisticAdd, optimisticUpdate, optimisticDelete, prefetchQuery, invalidateMany)
- Created cursor-pagination.ts (useCursorPagination, parseCursorParams, buildCursorResponse, buildCursorPrismaQuery, prefetchNextCursorPage)
- Updated Dockerfile: SQLite for build verification, --no-cache for clean builds
- Created docker-verify.sh (5-step verification: clean → build → verify → healthcheck → summary)
- Fixed sprint1-p0-acceptance.test.ts to use correct Prisma model names
- Added Account.version and JournalEntry.version for P0-8 optimistic locking
- All builds succeed, 3662+ tests passing

Stage Summary:
- Prisma schema: 83 models (from 41 → 83)
- New infrastructure: Providers.tsx, optimistic.ts, cursor-pagination.ts, docker-verify.sh
- TanStack Query fully wired: QueryProvider in app tree + 40+ existing hooks + optimistic update utilities
- Cursor-based pagination: Infinite query hook + server-side helpers + Prisma query builder
- Docker: Clean build verification script + SQLite-compatible build
