# Task 6 & 7 — Egypt ETA + Bahrain/Oman/Qatar e-invoicing

## Agent: egypt-bahrain-oman-compliance-builder

## Summary

Built complete e-invoicing compliance modules for Egypt (ETA), Bahrain (NBR), Oman (Tax Authority), and a central E-Invoicing Router that dispatches invoices to the correct authority based on company country.

## Files Created

### Core Modules
1. `src/lib/e-invoicing/egypt-eta.ts` — Egypt ETA compliance (validate, generate payload, submit, auto-populate, check status, invoice type classification, UUID generation)
2. `src/lib/e-invoicing/egypt-eta-validation.ts` — Egypt ETA validation middleware (auto-detect EG companies, enforce EGP/14% VAT, auto-populate, validate)
3. `src/lib/e-invoicing/bahrain-nbr.ts` — Bahrain NBR compliance (validate, generate payload, submit, auto-populate, invoice type, UUID)
4. `src/lib/e-invoicing/oman-tax.ts` — Oman Tax compliance (validate, generate payload, submit, auto-populate, invoice type, UUID)
5. `src/lib/e-invoicing/router.ts` — Central dispatcher (route, validate, auto-populate, submit for all 6 authorities + none)

### Test Files
6. `src/lib/e-invoicing/__tests__/egypt-eta.test.ts` — Egypt ETA tests
7. `src/lib/e-invoicing/__tests__/bahrain-nbr.test.ts` — Bahrain NBR tests
8. `src/lib/e-invoicing/__tests__/oman-tax.test.ts` — Oman Tax tests
9. `src/lib/e-invoicing/__tests__/router.test.ts` — Router tests

## Key Design Decisions

- **Egypt**: 3 invoice types (standard/simplified/export), Arabic + English dual language mandatory, EGP 2-decimal, 14% VAT, digital receipt (إيصال إلكتروني) for B2C
- **Bahrain**: BHD 3-decimal, 10% VAT, Arabic + English dual language, NBR portal under development
- **Oman**: OMR 3-decimal, 5% VAT, Arabic mandatory, English optional (recommended for B2B), Oman Tax portal under development
- **Qatar**: No e-invoicing requirement yet (routed to "none")
- **Router**: Unified dispatcher with consistent return types across all authorities

## Patterns Followed

Same patterns as Kuwait/ZATCA/UAE modules:
- ValidationError with field, messageAr, messageEn, severity
- ValidationResult with valid, errors, warnings
- InvoicePayload with dual calendar dates, seller/buyer fields, line items, totals
- SubmissionResult with ok, eInvoiceId, submissionStatus, error
- Auto-populate pattern: UUID → Hijri → TRN → currency → VAT → monetary precision → authority → PIH
- Middleware pattern: check country → enforce currency → enforce VAT → auto-populate → validate → separate errors/warnings
- Arabic error messages per authority style (Egyptian Arabic vs Gulf Arabic)

## Lint Results

No new lint errors introduced. Pre-existing error in status/page.tsx (unrelated).
Dev server running successfully.
