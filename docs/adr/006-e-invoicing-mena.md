# ADR 006: Support MENA Region E-Invoicing Standards

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Product Team, Engineering Team, Compliance Owner

## Context

MENA countries are progressively mandating electronic invoicing (e-invoicing) for businesses. Each country has its own standard, API, and compliance requirements:

| Country | Authority | Standard | Status |
|---|---|---|---|
| Saudi Arabia | ZATCA | Fatoorah (UBL/XML) | Mandatory Phase 2 |
| UAE | FTA | E-invoice (PDF/XML) | Mandatory |
| Bahrain | NBR | VAT invoice | Mandatory |
| Oman | Oman Tax | E-invoice | Progressive |
| Kuwait | MoF | E-invoice | Planned |
| Egypt | ETA | E-invoice | Mandatory |

These standards share common principles but differ in:
- Document format (UBL, XML, PDF/A3)
- Signing requirements (digital certificates, QR codes)
- Submission APIs (REST, SOAP)
- Validation rules (tax calculation, field requirements)
- Language requirements (Arabic text mandatory for some, optional for others)

## Decision

We implement a **routing-based e-invoicing system** in `src/lib/e-invoicing/router.ts` that dispatches invoice compliance to country-specific handlers. Each country has a dedicated module:

- `zatca.ts` — Saudi Arabia (ZATCA Phase 2)
- `uae-fta.ts` — UAE Federal Tax Authority
- `bahrain-nbr.ts` — Bahrain National Bureau for Revenue
- `oman-tax.ts` — Oman Tax Authority
- `kuwait.ts` — Kuwait (planned)
- `egypt-eta.ts` — Egypt Electronic Tax Authority

Each module implements:
1. **Validation**: Country-specific invoice field validation
2. **Signing**: Digital certificate/QR code generation (ZATCA requires cryptographic signing)
3. **Submission**: API integration for submitting invoices to the authority
4. **Retention**: Document retention per country's legal requirements

The router selects the appropriate handler based on the company's country (`company.country` field). The `zatca-certs.ts` module handles ZATCA certificate management.

## Consequences

### Positive
- Legal compliance in all mandated MENA countries
- Single interface for e-invoicing regardless of country
- Country-specific validation prevents submission errors
- Modular design — adding a new country doesn't affect existing ones
- Audit trail for every e-invoice submission

### Negative
- Each country module requires ongoing maintenance as standards evolve
- ZATCA certificate management is complex (PCSID, CCSID compliance)
- Testing requires country-specific test environments (ZATCA sandbox, FTA simulator)
- Certification/signing adds processing latency to invoice creation
- Some countries' APIs are unreliable or poorly documented

### Neutral
- Must track regulatory changes across 6+ countries
- Some countries may add new requirements (e.g., Kuwait's planned mandate)
- E-invoice format standardization is progressing — may converge in future

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Single universal format** | Simple; one implementation | No country accepts a universal format | Rejected — standards are legally mandated per country |
| **Third-party e-invoicing service** | Less implementation effort | Vendor dependency; cost per invoice; may not support all MENA countries | Future consideration — for less common countries |
| **ZATCA only** | Covers largest MENA market | Excludes UAE, Bahrain, Egypt, Oman businesses | Rejected — multi-country is core value proposition |
| **Manual compliance (no automation)** | No implementation cost | Unacceptable for SaaS; users expect automated compliance | Rejected — defeats product purpose |
