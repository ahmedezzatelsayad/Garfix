# ADR 003: Arabic-first with RTL Layout

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Product Team, Engineering Team

## Context

GARFIX EOS serves businesses across 20+ MENA countries where Arabic is the primary or official language. The current product landscape has two major UX deficiencies:

1. **LTR-first products**: Most ERP platforms (Odoo, Zoho, FreshBooks) treat Arabic as a translation overlay on an LTR-first layout. This results in awkward text alignment, reversed navigation patterns, and misaligned form elements.

2. **Translation quality**: Competitors rely on automated translations that produce incorrect Arabic terminology for financial concepts (e.g., "trial balance" becomes "ميزان المراجعة" instead of "ميزان المراجعة" — but many use incorrect terms).

The MENA market expects native Arabic UX, not a bolted-on translation.

## Decision

GARFIX EOS will be **Arabic-first with RTL layout** as the default experience. This means:

1. **RTL as default**: All layouts use `dir="rtl"` by default. LTR is available for English-mode users.
2. **Arabic content first**: All labels, descriptions, error messages, and UI text are written in Arabic first, then translated to English.
3. **Logical CSS properties**: Use CSS logical properties (`start`, `end`, `margin-inline-start`, `padding-inline-end`) instead of physical properties (`left`, `right`) throughout the codebase.
4. **Bidi-aware components**: All shadcn/ui components are wrapped to respect the current direction context.
5. **Arabic typography**: Proper Arabic font stack with appropriate line height and letter spacing.
6. **Number formatting**: Arabic numeral support (Hindi digits ٠١٢٣٤٥٦٧٨٩) as optional, Western digits as default for financial contexts.

Implementation:
- Root layout: `<html lang="ar" dir="rtl">` (can be toggled per user preference)
- Tailwind: RTL-aware classes using logical properties
- Landing page: Arabic-first hero, features, pricing, FAQ
- App shell: RTL sidebar (right-aligned), RTL topbar

## Consequences

### Positive
- Native MENA market experience — not a bolted-on translation
- Higher user adoption and satisfaction in MENA markets
- Correct Arabic terminology for financial concepts
- Bidirectional support enables English-mode for international users
- Competitive advantage over LTR-first products

### Negative
- More complex CSS — must use logical properties everywhere
- Some third-party components may not support RTL well (need custom wrappers)
- Testing overhead — every screen needs both RTL and LTR verification
- Framer Motion animations may need direction-aware adjustments

### Neutral
- English is available as a toggle, not a separate deployment
- Content authoring workflow: Arabic text → English translation (not reverse)

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **LTR-first with Arabic overlay** | Simpler CSS; common pattern | Poor UX for Arabic users; market disadvantage | Rejected — defeats the purpose |
| **Two separate deployments (Arabic/English)** | No bidi complexity | Maintenance nightmare; feature divergence risk | Rejected — unsustainable |
| **Auto-detect direction per page** | Flexible | Inconsistent UX; layout jumps between pages | Rejected — confusing for users |
| **RTL-only (no English)** | Simplest implementation | Excludes English-speaking users in MENA | Rejected — needs bilingual support |
