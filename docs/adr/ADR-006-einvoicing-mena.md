# ADR-006: MENA E-Invoicing Compliance

## Status: Accepted

## Context
MENA governments increasingly mandate e-invoicing (ZATCA Phase 2, UAE FTA, Egypt ETA, Kuwait Decree 10/2026). Without compliance, the product cannot compete in its target market.

## Decision
Implement e-invoicing for 6 MENA countries:
- Saudi Arabia: ZATCA Phase 2 (XML/UBL, ECDSA signing)
- UAE: FTA VAT e-invoicing
- Egypt: ETA e-invoicing
- Kuwait: Decree 10/2026
- Bahrain: NBR e-invoicing
- Oman: Tax Authority
Plus unified routing and retention per jurisdiction.

## Consequences
- Product uniquely positioned for MENA market
- Each country module handles local requirements
- Validation ensures submittable invoices
- Retention policies comply with local laws
