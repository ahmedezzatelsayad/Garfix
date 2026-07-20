# Task: PDF Template Settings Feature

## Summary
Added PDF template customization settings for invoices in the ERP application.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- Added `InvoiceTemplateSettings` model with fields: id, companySlug, templateId, primaryColor, fontFamily, fontSize, showLogo, logoPosition, showPaymentInfo, showStamp, invoiceTypes, createdAt, updatedAt
- Added `invoiceTemplateSettings` relation to Company model (1:1, optional)
- Applied `@@unique([companySlug])` constraint and `@@map("invoice_template_settings")`
- Schema pushed to database successfully

### 2. API Endpoint (`src/app/api/invoice-templates/route.ts`)
- Added `PATCH` handler for saving template settings
- Added `TemplateSettingsSchema` with zod validation for all fields
- Uses `upsert` pattern (create or update) per companySlug
- GET handler now also returns `templateSettings` alongside templates
- Auth/permission check via `requirePermissionForCompany(req, "settings_access", ...)`
- Audit logging for template settings updates

### 3. SettingsView (`src/modules/settings/SettingsView.tsx`)
- Added new "PDF Template Settings" card section using shadcn/ui Card component
- Template selector with 4 preview cards (classic, modern, minimal, arabic-rtl)
- Color picker (native + hex input)
- Font selector dropdown (5 Arabic-compatible fonts)
- Font size slider (8-24px)
- Toggle switches for showLogo, showPaymentInfo, showStamp
- Logo position selector (right/center/left buttons)
- Invoice type multi-select with checkboxes (sales, purchase, quote)
- Save button calls PATCH `/api/invoice-templates`
- Auto-fetches template settings when company changes
- All UI labels in Arabic

## Lint Status
- No new lint errors introduced
- All 4 pre-existing errors are in unrelated files (scripts/, AccountView.tsx, PlatformAdminPanel.tsx)
