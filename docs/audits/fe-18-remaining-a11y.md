# FE-18 FIX (Audit v2 · Phase 4): Remaining a11y gaps

## Fixed
- Added `aria-label` to icon-only buttons in GarfixModal close button, GarfixDrawer close button
- Added `role="alert"` to remaining error displays in signup form
- Added `aria-describedby` to password inputs with helper text

## Verified
- All error displays now have `role="alert"` or `aria-live`
- All icon-only buttons have `aria-label`
- All form inputs have associated labels
