---
Task ID: 4
Agent: zatca-compliance-builder
Task: Build Saudi ZATCA Phase 2 e-invoicing integration

## Summary

Built complete Saudi ZATCA Phase 2 e-invoicing compliance module for GarfiX ERP, following established patterns from Kuwait module (Task 3).

## Files Created

| File | Description |
|------|-------------|
| `src/lib/e-invoicing/zatca.ts` | ZATCA Invoice Generator — UBL 2.1 XML, ECDSA signing, validation, auto-population |
| `src/lib/e-invoicing/zatca-certs.ts` | ZATCA Certificate Management — CSID/CCD onboarding, AES-256-GCM encrypted storage |
| `src/lib/e-invoicing/zatca-validation.ts` | ZATCA Compliance Middleware — auto-detect SA companies, validate, enrich |
| `src/lib/e-invoicing/__tests__/zatca.test.ts` | Tests for all ZATCA module functions |

## Files Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Added `ZatcaCertificate` model, `zatcaCertificates` relation on Company |

## Key Features

- **UBL 2.1 XML Generation**: Standard (381/B2B) and Simplified (388/B2C) invoice types with full UBL structure
- **ECDSA Signing Placeholder**: Integration points for real CSID/CCD certificate injection, uses node:crypto when available
- **Certificate Management**: Full onboarding flow (CSID → CCD), AES-256-GCM encrypted storage, expiry tracking, renewal
- **Validation**: Seller VAT TRN, Arabic mandatory, SAR 2 decimals, 15% VAT, B2B/B2C classification consistency
- **Auto-population**: UUID, Hijri dates, VAT TRN, Arabic fields, SAR currency, 15% VAT rate, PIH placeholder
- **Middleware**: Auto-detects Saudi companies, enforces SAR + 15% VAT, blocks with Arabic error messages
- **Saudi Arabic Error Messages**: Consistent with هيئة الزكاة والضريبة والجمارك style
