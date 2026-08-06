# E-Invoicing Webhook Sandbox Test Results

**Timestamp:** 2026-08-06T20:41:09.722Z
**Test type:** self-contained-sandbox (production HMAC + recordReceipt logic, in-memory DB mock)

## Summary

| Metric | Value |
|--------|-------|
| Total test cases | 28 |
| Passed | 28 |
| Failed | 0 |
| New receipts created | 21 |
| Duplicates deduped (idempotent) | 7 |
| signatureValid: true (HMAC verified) | 14 |
| signatureValid: false (HMAC mismatch) | 7 |
| signatureValid: null (no signature header) | 7 |

## Test Cases

| # | Test | Country | Case | UUID (last 12) | HTTP | sigValid (exp→actual) | Deduped | Receipt ID | Passed |
|---|------|---------|------|----------------|------|------------------------|---------|------------|--------|
| 1 | SA valid_signed | SA | valid_signed | `434-SA-valid` | 200 | true → true | — | rec_0001 | ✓ |
| 2 | SA unsigned | SA | unsigned | `-SA-unsigned` | 200 | null → null | — | rec_0002 | ✓ |
| 3 | SA invalid_signed | SA | invalid_signed | `4-SA-invalid` | 200 | false → false | — | rec_0003 | ✓ |
| 4 | SA duplicate | SA | duplicate | `434-SA-valid` | 200 | true → true | ✓ | rec_0001 | ✓ |
| 5 | EG valid_signed | EG | valid_signed | `434-EG-valid` | 200 | true → true | — | rec_0004 | ✓ |
| 6 | EG unsigned | EG | unsigned | `-EG-unsigned` | 200 | null → null | — | rec_0005 | ✓ |
| 7 | EG invalid_signed | EG | invalid_signed | `4-EG-invalid` | 200 | false → false | — | rec_0006 | ✓ |
| 8 | EG duplicate | EG | duplicate | `434-EG-valid` | 200 | true → true | ✓ | rec_0004 | ✓ |
| 9 | AE valid_signed | AE | valid_signed | `434-AE-valid` | 200 | true → true | — | rec_0007 | ✓ |
| 10 | AE unsigned | AE | unsigned | `-AE-unsigned` | 200 | null → null | — | rec_0008 | ✓ |
| 11 | AE invalid_signed | AE | invalid_signed | `4-AE-invalid` | 200 | false → false | — | rec_0009 | ✓ |
| 12 | AE duplicate | AE | duplicate | `434-AE-valid` | 200 | true → true | ✓ | rec_0007 | ✓ |
| 13 | KW valid_signed | KW | valid_signed | `434-KW-valid` | 200 | true → true | — | rec_0010 | ✓ |
| 14 | KW unsigned | KW | unsigned | `-KW-unsigned` | 200 | null → null | — | rec_0011 | ✓ |
| 15 | KW invalid_signed | KW | invalid_signed | `4-KW-invalid` | 200 | false → false | — | rec_0012 | ✓ |
| 16 | KW duplicate | KW | duplicate | `434-KW-valid` | 200 | true → true | ✓ | rec_0010 | ✓ |
| 17 | BH valid_signed | BH | valid_signed | `434-BH-valid` | 200 | true → true | — | rec_0013 | ✓ |
| 18 | BH unsigned | BH | unsigned | `-BH-unsigned` | 200 | null → null | — | rec_0014 | ✓ |
| 19 | BH invalid_signed | BH | invalid_signed | `4-BH-invalid` | 200 | false → false | — | rec_0015 | ✓ |
| 20 | BH duplicate | BH | duplicate | `434-BH-valid` | 200 | true → true | ✓ | rec_0013 | ✓ |
| 21 | OM valid_signed | OM | valid_signed | `434-OM-valid` | 200 | true → true | — | rec_0016 | ✓ |
| 22 | OM unsigned | OM | unsigned | `-OM-unsigned` | 200 | null → null | — | rec_0017 | ✓ |
| 23 | OM invalid_signed | OM | invalid_signed | `4-OM-invalid` | 200 | false → false | — | rec_0018 | ✓ |
| 24 | OM duplicate | OM | duplicate | `434-OM-valid` | 200 | true → true | ✓ | rec_0016 | ✓ |
| 25 | QA valid_signed | QA | valid_signed | `434-QA-valid` | 200 | true → true | — | rec_0019 | ✓ |
| 26 | QA unsigned | QA | unsigned | `-QA-unsigned` | 200 | null → null | — | rec_0020 | ✓ |
| 27 | QA invalid_signed | QA | invalid_signed | `4-QA-invalid` | 200 | false → false | — | rec_0021 | ✓ |
| 28 | QA duplicate | QA | duplicate | `434-QA-valid` | 200 | true → true | ✓ | rec_0019 | ✓ |

## Recorded Receipts (in-memory store)

| Receipt ID | Authority | Event Type | UUID (last 12) | Status | SigValid | Received At |
|------------|-----------|------------|----------------|--------|----------|-------------|
| rec_0001 | zatca | cleared | `434-SA-valid` | accepted | true | 20:41:09 |
| rec_0002 | zatca | cleared | `-SA-unsigned` | accepted | null | 20:41:09 |
| rec_0003 | zatca | cleared | `4-SA-invalid` | accepted | false | 20:41:09 |
| rec_0004 | eta_egypt | cleared | `434-EG-valid` | accepted | true | 20:41:09 |
| rec_0005 | eta_egypt | cleared | `-EG-unsigned` | accepted | null | 20:41:09 |
| rec_0006 | eta_egypt | cleared | `4-EG-invalid` | accepted | false | 20:41:09 |
| rec_0007 | uae_fta | cleared | `434-AE-valid` | accepted | true | 20:41:09 |
| rec_0008 | uae_fta | cleared | `-AE-unsigned` | accepted | null | 20:41:09 |
| rec_0009 | uae_fta | cleared | `4-AE-invalid` | accepted | false | 20:41:09 |
| rec_0010 | kuwait_decree_10_2026 | cleared | `434-KW-valid` | accepted | true | 20:41:09 |
| rec_0011 | kuwait_decree_10_2026 | cleared | `-KW-unsigned` | accepted | null | 20:41:09 |
| rec_0012 | kuwait_decree_10_2026 | cleared | `4-KW-invalid` | accepted | false | 20:41:09 |
| rec_0013 | bahrain_nbr | cleared | `434-BH-valid` | accepted | true | 20:41:09 |
| rec_0014 | bahrain_nbr | cleared | `-BH-unsigned` | accepted | null | 20:41:09 |
| rec_0015 | bahrain_nbr | cleared | `4-BH-invalid` | accepted | false | 20:41:09 |
| rec_0016 | oman_tax | cleared | `434-OM-valid` | accepted | true | 20:41:09 |
| rec_0017 | oman_tax | cleared | `-OM-unsigned` | accepted | null | 20:41:09 |
| rec_0018 | oman_tax | cleared | `4-OM-invalid` | accepted | false | 20:41:09 |
| rec_0019 | qatar_gta | cleared | `434-QA-valid` | accepted | true | 20:41:09 |
| rec_0020 | qatar_gta | cleared | `-QA-unsigned` | accepted | null | 20:41:09 |
| rec_0021 | qatar_gta | cleared | `4-QA-invalid` | accepted | false | 20:41:09 |

## Test Secrets (sandbox only — DO NOT USE IN PRODUCTION)

| Country | Secret (first 30 chars) |
|---------|------------------------|
| SA | `test-zatca-csid-secret-DO-NOT-…` |
| EG | `test-eta-jwt-secret-DO-NOT-USE…` |
| AE | `test-uae-ap-secret-DO-NOT-USE-…` |
| KW | `test-kw-mof-secret-DO-NOT-USE-…` |
| BH | `test-bh-nbr-key-DO-NOT-USE-IN-…` |
| OM | `test-om-ta-secret-DO-NOT-USE-I…` |
| QA | `test-qa-ap-secret-DO-NOT-USE-I…` |

## Sample Payloads

Sample payloads + curl commands saved to `/home/z/my-project/download/e-invoicing-webhook-payloads/`:

- `SA-sample.json` — payload + signature + curl command
- `EG-sample.json` — payload + signature + curl command
- `AE-sample.json` — payload + signature + curl command
- `KW-sample.json` — payload + signature + curl command
- `BH-sample.json` — payload + signature + curl command
- `OM-sample.json` — payload + signature + curl command
- `QA-sample.json` — payload + signature + curl command

---
*Generated by `scripts/test-einvoice-webhooks.ts` — production HMAC + recordReceipt logic exercised against an in-memory DB mock.*