"use client";

import { useState, useMemo, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────
interface ApiEndpoint {
  path: string;
  method: string;
  summary: string;
  summaryAr: string;
  description: string;
  tag: string;
  tagAr: string;
  authRequired: boolean;
  permission?: string;
  params?: Array<{ name: string; in: string; required: boolean; type: string; description: string }>;
  requestBody?: string;
  responses?: Array<{ status: string; description: string }>;
}

// ─── API Data ───────────────────────────────────────────────────────────
const API_ENDPOINTS: ApiEndpoint[] = [
  // AUTH
  { path: "/api/auth/login", method: "POST", summary: "Login", summaryAr: "تسجيل الدخول", description: "Validates credentials, issues access + refresh cookies. Rate-limited: 5 attempts per 15 min per IP and per email.", tag: "Auth", tagAr: "المصادقة", authRequired: false, requestBody: "{ email, password }", responses: [{ status: "200", description: "Login successful — cookies set" }, { status: "401", description: "Invalid credentials" }, { status: "429", description: "Rate limited" }] },
  { path: "/api/auth/register", method: "POST", summary: "Register", summaryAr: "إنشاء حساب", description: "Creates user account. Anti-enumeration: always returns 200 generic message. Password: 10+ chars, upper/lower/digit/symbol.", tag: "Auth", tagAr: "المصادقة", authRequired: false, requestBody: "{ email, password, displayName }", responses: [{ status: "200", description: "Generic anti-enumeration response" }, { status: "429", description: "Rate limited" }] },
  { path: "/api/auth/me", method: "GET", summary: "Get current user", summaryAr: "الملف الشخصي", description: "Returns authenticated user profile.", tag: "Auth", tagAr: "المصادقة", authRequired: true, responses: [{ status: "200", description: "User profile" }, { status: "401", description: "Unauthorized" }] },
  { path: "/api/auth/refresh", method: "POST", summary: "Refresh token", summaryAr: "تجديد الجلسة", description: "Issues new access cookie from refresh token.", tag: "Auth", tagAr: "المصادقة", authRequired: false, responses: [{ status: "200", description: "New access cookie" }, { status: "401", description: "Refresh expired" }] },
  { path: "/api/auth/logout", method: "POST", summary: "Logout", summaryAr: "تسجيل الخروج", description: "Clears cookies, increments tokenVersion.", tag: "Auth", tagAr: "المصادقة", authRequired: true, responses: [{ status: "200", description: "Logged out" }] },
  { path: "/api/auth/change-password", method: "POST", summary: "Change password", summaryAr: "تغيير كلمة المرور", description: "Change password for authenticated user.", tag: "Auth", tagAr: "المصادقة", authRequired: true, requestBody: "{ currentPassword, newPassword }", responses: [{ status: "200", description: "Password changed" }] },
  { path: "/api/auth/forgot-password", method: "POST", summary: "Forgot password", summaryAr: "نسيت كلمة المرور", description: "Sends reset email (silently ignores unknown emails).", tag: "Auth", tagAr: "المصادقة", authRequired: false, requestBody: "{ email }", responses: [{ status: "200", description: "Reset email sent" }] },
  { path: "/api/auth/reset-password", method: "POST", summary: "Reset password", summaryAr: "إعادة تعيين كلمة المرور", description: "Reset password with token from email.", tag: "Auth", tagAr: "المصادقة", authRequired: false, requestBody: "{ token, newPassword }", responses: [{ status: "200", description: "Password reset" }] },
  { path: "/api/auth/csrf", method: "GET", summary: "Get CSRF token", summaryAr: "رمز الحماية", description: "Returns CSRF token for form submissions.", tag: "Auth", tagAr: "المصادقة", authRequired: false, responses: [{ status: "200", description: "CSRF token" }] },

  // INVOICES
  { path: "/api/invoices", method: "GET", summary: "List invoices", summaryAr: "قائمة الفواتير", description: "Cursor-based pagination. Filter by company, status, search. Requires view_invoices.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "view_invoices", params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Tenant company slug" }, { name: "status", in: "query", required: false, type: "string", description: "draft|sent|overdue|cancelled|paid|partial" }, { name: "search", in: "query", required: false, type: "string", description: "Search text" }, { name: "limit", in: "query", required: false, type: "integer", description: "Max 500" }, { name: "cursor", in: "query", required: false, type: "string", description: "Pagination cursor" }], responses: [{ status: "200", description: "Invoice list + nextCursor" }] },
  { path: "/api/invoices", method: "POST", summary: "Create invoice", summaryAr: "إنشاء فاتورة", description: "Requires create_invoice. Enforces trial/quota. Kuwait: auto-validates Decree 10/2026.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "create_invoice", requestBody: "{ companySlug, invoiceNumber, clientName, issueDate, dueDate, lineItems, taxRate, ... }", params: [], responses: [{ status: "200", description: "Invoice created" }, { status: "402", description: "TRIAL_EXPIRED or QUOTA_EXCEEDED" }, { status: "409", description: "Invoice number exists" }] },
  { path: "/api/invoices/{id}", method: "GET", summary: "Get invoice", summaryAr: "عرض فاتورة", description: "Fetch single invoice by ID.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Invoice ID" }], responses: [{ status: "200", description: "Invoice details" }, { status: "404", description: "Not found" }] },
  { path: "/api/invoices/{id}", method: "PATCH", summary: "Update invoice", summaryAr: "تحديث فاتورة", description: "Optimistic-lock version check. Status NOT changeable here. Requires edit_invoice.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "edit_invoice", requestBody: "{ ...fields, expectedVersion }", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Invoice ID" }], responses: [{ status: "200", description: "Updated" }, { status: "409", description: "VERSION_CONFLICT" }] },
  { path: "/api/invoices/{id}", method: "DELETE", summary: "Delete invoice", summaryAr: "حذف فاتورة", description: "Soft-delete (sets deletedAt). Kuwait: retention check logged.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "delete_invoice", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Invoice ID" }], responses: [{ status: "200", description: "Soft-deleted" }] },
  { path: "/api/invoices/{id}/status", method: "PATCH", summary: "Change status", summaryAr: "تغيير حالة الفاتورة", description: "Operational status transitions only. Paid/partial via /payment.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "edit_invoice", requestBody: "{ status }", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Invoice ID" }], responses: [{ status: "200", description: "Status updated" }] },
  { path: "/api/invoices/{id}/payment", method: "PATCH", summary: "Record payment", summaryAr: "تسجيل دفعة", description: "Update paid/partial status with amount. Requires finance_access.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, permission: "finance_access", requestBody: "{ paidAmount, paymentMethod, reference }", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Invoice ID" }], responses: [{ status: "200", description: "Payment recorded" }] },

  // CLIENTS
  { path: "/api/clients", method: "GET", summary: "List clients", summaryAr: "قائمة العملاء", description: "Requires view_customers.", tag: "Clients", tagAr: "العملاء", authRequired: true, permission: "view_customers", params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }, { name: "search", in: "query", required: false, type: "string", description: "Search text" }], responses: [{ status: "200", description: "Client list + nextCursor" }] },
  { path: "/api/clients", method: "POST", summary: "Create client", summaryAr: "إنشاء عميل", description: "Requires edit_customer.", tag: "Clients", tagAr: "العملاء", authRequired: true, permission: "edit_customer", requestBody: "{ companySlug, name, email, phone, ... }", responses: [{ status: "200", description: "Client created" }] },
  { path: "/api/clients/{id}", method: "GET", summary: "Get client", summaryAr: "عرض عميل", description: "Fetch single client.", tag: "Clients", tagAr: "العملاء", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Client ID" }], responses: [{ status: "200", description: "Client details" }, { status: "404", description: "Not found" }] },
  { path: "/api/clients/{id}", method: "PATCH", summary: "Update client", summaryAr: "تحديث عميل", description: "Requires edit_customer.", tag: "Clients", tagAr: "العملاء", authRequired: true, permission: "edit_customer", requestBody: "{ name, email, phone, ... }", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Client ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/clients/{id}", method: "DELETE", summary: "Delete client", summaryAr: "حذف عميل", description: "Soft-delete.", tag: "Clients", tagAr: "العملاء", authRequired: true, permission: "delete_customer", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Client ID" }], responses: [{ status: "200", description: "Soft-deleted" }] },
  { path: "/api/clients/{id}/profile", method: "GET", summary: "Client profile", summaryAr: "ملف العميل", description: "Client profile with invoices summary.", tag: "Clients", tagAr: "العملاء", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Client ID" }], responses: [{ status: "200", description: "Profile data" }] },

  // CATALOG
  { path: "/api/catalog", method: "GET", summary: "List products", summaryAr: "قائمة المنتجات", description: "Requires view_catalog.", tag: "Catalog", tagAr: "الكتالوج", authRequired: true, permission: "view_catalog", params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }, { name: "search", in: "query", required: false, type: "string", description: "Search name or code" }], responses: [{ status: "200", description: "Product list + nextCursor" }] },
  { path: "/api/catalog", method: "POST", summary: "Create product", summaryAr: "إنشاء منتج", description: "Requires settings_access.", tag: "Catalog", tagAr: "الكتالوج", authRequired: true, permission: "settings_access", requestBody: "{ companySlug, name, code, aliases, purchasePrice, sellingPrice, wholesalePrice }", responses: [{ status: "200", description: "Product created" }] },
  { path: "/api/catalog/{id}", method: "PATCH", summary: "Update product", summaryAr: "تحديث منتج", description: "Update product details.", tag: "Catalog", tagAr: "الكتالوج", authRequired: true, permission: "settings_access", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Product ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/catalog/{id}", method: "DELETE", summary: "Delete product", summaryAr: "حذف منتج", description: "Delete product.", tag: "Catalog", tagAr: "الكتالوج", authRequired: true, permission: "settings_access", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Product ID" }], responses: [{ status: "200", description: "Deleted" }] },

  // INVENTORY
  { path: "/api/inventory/warehouses", method: "GET", summary: "List warehouses", summaryAr: "قائمة المستودعات", description: "Requires settings_access. Returns item counts per warehouse.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "companySlug مطلوب" }], responses: [{ status: "200", description: "Warehouse list" }] },
  { path: "/api/inventory/warehouses", method: "POST", summary: "Create warehouse", summaryAr: "إنشاء مستودع", description: "Requires settings_access. Code must be unique per company.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", requestBody: "{ companySlug, name, code, address, isActive }", responses: [{ status: "201", description: "Warehouse created" }, { status: "409", description: "Code already exists" }] },
  { path: "/api/inventory/warehouses/{id}", method: "PATCH", summary: "Update warehouse", summaryAr: "تحديث مستودع", description: "Update warehouse.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Warehouse ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/inventory/warehouses/{id}", method: "DELETE", summary: "Delete warehouse", summaryAr: "حذف مستودع", description: "Delete warehouse.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", params: [{ name: "id", in: "path", required: true, type: "integer", description: "Warehouse ID" }], responses: [{ status: "200", description: "Deleted" }] },
  { path: "/api/inventory/items", method: "GET", summary: "List inventory items", summaryAr: "قائمة المخزون", description: "Requires settings_access. Returns items with OK/Low/Out status.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "companySlug مطلوب" }, { name: "warehouseId", in: "query", required: false, type: "integer", description: "Filter by warehouse" }, { name: "status", in: "query", required: false, type: "string", description: "OK|Low|Out" }], responses: [{ status: "200", description: "Items + summary" }] },
  { path: "/api/inventory/items", method: "POST", summary: "Adjust stock", summaryAr: "تعديل المخزون", description: "Set or adjust stock. Records StockMovement. Cannot go below zero.", tag: "Inventory", tagAr: "المخزون", authRequired: true, permission: "settings_access", requestBody: "{ companySlug, warehouseId, productId, quantity, mode: set|adjust, ... }", responses: [{ status: "200", description: "Adjusted" }, { status: "201", description: "New item created" }, { status: "400", description: "Cannot go below zero" }] },
  { path: "/api/inventory/movements", method: "GET", summary: "Stock movements", summaryAr: "سجل حركة المخزون", description: "List stock movement ledger entries.", tag: "Inventory", tagAr: "المخزون", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Movement list" }] },

  // ACCOUNTING
  { path: "/api/accounting/journal-entries", method: "GET", summary: "List journal entries", summaryAr: "قائمة القيود", description: "Requires finance_access.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, permission: "finance_access", params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Entries with lines" }] },
  { path: "/api/accounting/journal-entries", method: "POST", summary: "Create journal entry", summaryAr: "إنشاء قيد", description: "Requires finance_access. Must be balanced (debit = credit). If posted, updates account balances atomically.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, permission: "finance_access", requestBody: "{ companySlug, date, lines, status }", responses: [{ status: "200", description: "Entry created" }, { status: "400", description: "Unbalanced entry" }] },
  { path: "/api/accounting/journal-entries/{id}", method: "GET", summary: "Get journal entry", summaryAr: "عرض قيد", description: "Fetch single entry.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Entry ID" }], responses: [{ status: "200", description: "Entry details" }] },
  { path: "/api/accounting/journal-entries/{id}", method: "PATCH", summary: "Update journal entry", summaryAr: "تحديث قيد", description: "Update entry.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Entry ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/accounting/journal-entries/{id}/reverse", method: "POST", summary: "Reverse entry", summaryAr: "عكس قيد", description: "Reverse a posted journal entry.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Entry ID" }], responses: [{ status: "200", description: "Reversed" }] },
  { path: "/api/accounting/balance-sheet", method: "GET", summary: "Balance Sheet", summaryAr: "الميزانية العمومية", description: "Assets, liabilities, equity with totals and balance check.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, permission: "finance_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "companySlug مطلوب" }, { name: "asOf", in: "query", required: false, type: "string", description: "YYYY-MM-DD" }], responses: [{ status: "200", description: "Balance sheet" }] },
  { path: "/api/accounting/trial-balance", method: "GET", summary: "Trial Balance", summaryAr: "ميزان المراجعة", description: "Debit/credit totals per account.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, permission: "finance_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "companySlug مطلوب" }], responses: [{ status: "200", description: "Trial balance" }] },
  { path: "/api/accounting/profit-loss", method: "GET", summary: "Profit & Loss", summaryAr: "قائمة الدخل", description: "Revenue, expenses, net profit with margin.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, permission: "finance_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }, { name: "from", in: "query", required: false, type: "string", description: "YYYY-MM-DD" }, { name: "to", in: "query", required: false, type: "string", description: "YYYY-MM-DD" }], responses: [{ status: "200", description: "P&L report" }] },
  { path: "/api/accounting/accounts", method: "GET", summary: "List accounts", summaryAr: "قائمة الحسابات", description: "Chart of accounts.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Account list" }] },
  { path: "/api/accounting/accounts", method: "POST", summary: "Create account", summaryAr: "إنشاء حساب", description: "Create a new account.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, responses: [{ status: "200", description: "Account created" }] },
  { path: "/api/accounting/cash-flow", method: "GET", summary: "Cash Flow", summaryAr: "التدفقات النقدية", description: "Cash flow report.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Cash flow" }] },
  { path: "/api/accounting/aging", method: "GET", summary: "Aging report", summaryAr: "تقرير الأعمار", description: "AR/AP aging.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Aging data" }] },
  { path: "/api/accounting/vouchers", method: "GET", summary: "List vouchers", summaryAr: "قائمة السندات", description: "Payment/receipt vouchers.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Voucher list" }] },
  { path: "/api/accounting/vouchers", method: "POST", summary: "Create voucher", summaryAr: "إنشاء سند", description: "Create voucher.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, responses: [{ status: "200", description: "Created" }] },
  { path: "/api/accounting/fixed-assets", method: "GET", summary: "Fixed assets", summaryAr: "الأصول الثابتة", description: "List fixed assets.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Asset list" }] },
  { path: "/api/accounting/budgets", method: "GET", summary: "Budgets", summaryAr: "الميزانيات", description: "List budgets.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Budget list" }] },
  { path: "/api/accounting/fiscal-periods", method: "GET", summary: "Fiscal periods", summaryAr: "الفترات المالية", description: "List fiscal periods.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Period list" }] },
  { path: "/api/accounting/cost-centers", method: "GET", summary: "Cost centers", summaryAr: "مراكز التكلفة", description: "List cost centers.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Cost center list" }] },
  { path: "/api/accounting/tax-filing", method: "GET", summary: "Tax filings", summaryAr: "الإقرارات الضريبية", description: "List tax filings.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Tax filing list" }] },
  { path: "/api/accounting/financial-dashboard", method: "GET", summary: "Financial dashboard", summaryAr: "لوحة المالية", description: "Financial dashboard KPIs.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Dashboard data" }] },
  { path: "/api/accounting/consolidation", method: "GET", summary: "Consolidation", summaryAr: "التجميع", description: "Multi-company consolidation.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, responses: [{ status: "200", description: "Consolidation" }] },
  { path: "/api/accounting/bank-reconciliation", method: "GET", summary: "Bank reconciliation", summaryAr: "مطابقة بنكية", description: "Bank reconciliation.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Reconciliation list" }] },
  { path: "/api/accounting/bank-accounts", method: "GET", summary: "Bank accounts", summaryAr: "الحسابات البنكية", description: "List bank accounts.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Bank account list" }] },
  { path: "/api/accounting/payroll", method: "GET", summary: "Payroll", summaryAr: "الراتب", description: "Payroll data.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Payroll" }] },
  { path: "/api/accounting/depreciation", method: "GET", summary: "Depreciation", summaryAr: "الإهلاك", description: "Depreciation schedule.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Depreciation" }] },
  { path: "/api/accounting/inventory-valuation", method: "GET", summary: "Inventory valuation", summaryAr: "تقييم المخزون", description: "Inventory valuation.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Valuation" }] },
  { path: "/api/accounting/quotations", method: "GET", summary: "Quotations", summaryAr: "عروض الأسعار", description: "List quotations.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Quotation list" }] },
  { path: "/api/accounting/letters-of-credit", method: "GET", summary: "Letters of credit", summaryAr: "اعتمادات مستندي", description: "LC list.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "LC list" }] },
  { path: "/api/accounting/wps", method: "GET", summary: "WPS", summaryAr: "حماية الأجور", description: "Wage Protection System.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "WPS data" }] },
  { path: "/api/accounting/export-excel", method: "GET", summary: "Export Excel", summaryAr: "تصدير Excel", description: "Export accounting data as Excel.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Excel file" }] },
  { path: "/api/accounting/client-statement", method: "GET", summary: "Client statement", summaryAr: "كشف حساب العميل", description: "Client account statement.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Statement" }] },
  { path: "/api/accounting/supplier-statement", method: "GET", summary: "Supplier statement", summaryAr: "كشف حساب المورد", description: "Supplier account statement.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Statement" }] },
  { path: "/api/accounting/period-comparison", method: "GET", summary: "Period comparison", summaryAr: "مقارنة الفترات", description: "Compare financial periods.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Comparison" }] },
  { path: "/api/accounting/budget-vs-actual", method: "GET", summary: "Budget vs Actual", summaryAr: "الميزانية مقابل الفعلي", description: "Budget vs actual report.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Budget vs actual" }] },
  { path: "/api/accounting/profit-distribution", method: "GET", summary: "Profit distribution", summaryAr: "توزيع الأرباح", description: "Profit distribution data.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Distribution" }] },
  { path: "/api/accounting/commissions", method: "GET", summary: "Commissions", summaryAr: "العمولات", description: "Accounting commissions.", tag: "Accounting", tagAr: "المحاسبة", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Commissions" }] },

  // HR
  { path: "/api/hr/employees", method: "GET", summary: "List employees", summaryAr: "قائمة الموظفين", description: "Requires employee_management.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, permission: "employee_management", params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Employee list" }] },
  { path: "/api/hr/employees", method: "POST", summary: "Create employee", summaryAr: "إنشاء موظف", description: "Requires employee_management.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, permission: "employee_management", requestBody: "{ companySlug, name, nameEn, phone, email, position, department, baseSalary, currency, joinDate, isActive }", responses: [{ status: "200", description: "Employee created" }] },
  { path: "/api/hr/employees/{id}", method: "GET", summary: "Get employee", summaryAr: "عرض موظف", description: "Fetch single employee.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Employee ID" }], responses: [{ status: "200", description: "Employee details" }] },
  { path: "/api/hr/employees/{id}", method: "PATCH", summary: "Update employee", summaryAr: "تحديث موظف", description: "Update employee.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Employee ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/hr/employees/{id}", method: "DELETE", summary: "Delete employee", summaryAr: "حذف موظف", description: "Delete employee.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Employee ID" }], responses: [{ status: "200", description: "Deleted" }] },
  { path: "/api/hr/salaries", method: "GET", summary: "List salaries", summaryAr: "سجل الرواتب", description: "Salary records.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Salary records" }] },
  { path: "/api/hr/attendance", method: "GET", summary: "Attendance", summaryAr: "سجل الحضور", description: "Attendance records.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Attendance" }] },
  { path: "/api/hr/leaves", method: "GET", summary: "Leave requests", summaryAr: "طلبات الإجازات", description: "Leave requests.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Leaves" }] },
  { path: "/api/hr/performance", method: "GET", summary: "Performance reviews", summaryAr: "تقييم الأداء", description: "Performance reviews.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Reviews" }] },
  { path: "/api/hr/commissions", method: "GET", summary: "HR commissions", summaryAr: "عمولات الموظفين", description: "Employee commissions.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Commissions" }] },
  { path: "/api/hr/gratuity", method: "GET", summary: "Gratuity calculator", summaryAr: "حاسبة المكافأة", description: "End-of-service gratuity calculations.", tag: "HR", tagAr: "الموارد البشرية", authRequired: true, params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Gratuity" }] },

  // AI
  { path: "/api/ai/chat", method: "GET", summary: "Chat history", summaryAr: "سجل المحادثات", description: "Get recent chat messages for user/conversation.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, params: [{ name: "conversationId", in: "query", required: false, type: "string", description: "Conversation ID" }], responses: [{ status: "200", description: "Messages" }] },
  { path: "/api/ai/chat", method: "POST", summary: "AI Copilot chat", summaryAr: "محادثة الذكاء الاصطناعي", description: "Rate-limited 10/min. Injects business context. Smart Router with fallback.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, permission: "view_invoices", requestBody: "{ messages, companySlug?, conversationId? }", responses: [{ status: "200", description: "AI reply + meta" }, { status: "429", description: "Rate limited" }] },
  { path: "/api/ai/parse-image", method: "POST", summary: "Parse invoice image", summaryAr: "تحليل صورة فاتورة", description: "VLM extracts structured invoice data from image. Requires bulk_input.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, permission: "bulk_input", requestBody: "{ imageBase64, mimeType, companySlug?, autoAddProducts? }", responses: [{ status: "200", description: "Parsed orders" }, { status: "502", description: "Invalid AI JSON" }] },
  { path: "/api/ai/smart-parse", method: "POST", summary: "Smart-parse text", summaryAr: "تحليل نص الطلبات", description: "Parse text into structured orders.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Parsed orders" }] },
  { path: "/api/ai/bulk-import", method: "POST", summary: "Bulk import", summaryAr: "استيراد批量", description: "Bulk import orders via AI.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Imported" }] },
  { path: "/api/ai/memory", method: "GET", summary: "AI memories", summaryAr: "ذكريات الذكاء", description: "List AI memories.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Memory list" }] },
  { path: "/api/ai/agents", method: "GET", summary: "AI agents", summaryAr: "وكيل الذكاء", description: "List AI agents.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Agent list" }] },
  { path: "/api/ai/tools", method: "GET", summary: "AI tools", summaryAr: "أدوات الذكاء", description: "List available AI tools.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Tool list" }] },
  { path: "/api/ai/invoice-brain/extract", method: "POST", summary: "Invoice Brain", summaryAr: "استخراج الفاتورة", description: "Extract invoice data via Invoice Brain.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Extracted" }] },
  { path: "/api/ai/chat/stream", method: "POST", summary: "Streaming chat", summaryAr: "محادثة متدفقة", description: "SSE streaming variant of chat.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "SSE stream" }] },
  { path: "/api/ai/parse-file", method: "POST", summary: "Parse file", summaryAr: "تحليل ملف", description: "Parse PDF/Excel/etc.", tag: "AI", tagAr: "الذكاء الاصطناعي", authRequired: true, responses: [{ status: "200", description: "Parsed" }] },

  // DASHBOARD
  { path: "/api/dashboard/stats", method: "GET", summary: "Dashboard stats", summaryAr: "إحصائيات لوحة القيادة", description: "KPIs: invoices, revenue, paid, outstanding, monthly. Cached 30s.", tag: "Dashboard", tagAr: "لوحة القيادة", authRequired: true, params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }, { name: "fresh", in: "query", required: false, type: "string", description: "Bypass cache (1)" }], responses: [{ status: "200", description: "Dashboard stats" }] },

  // SETTINGS
  { path: "/api/settings", method: "GET", summary: "Get settings", summaryAr: "الإعدادات", description: "Public settings for all; full settings for founder/admin.", tag: "Settings", tagAr: "الإعدادات", authRequired: true, responses: [{ status: "200", description: "Settings + defaults" }] },
  { path: "/api/settings", method: "PATCH", summary: "Update settings", summaryAr: "تحديث الإعدادات", description: "Founder-only. Updates key/value pairs.", tag: "Settings", tagAr: "الإعدادات", authRequired: true, requestBody: "{ key: value, ... }", responses: [{ status: "200", description: "Updated" }, { status: "403", description: "Founder only" }] },

  // AUTOMATION
  { path: "/api/automation", method: "GET", summary: "List automation rules", summaryAr: "قواعد الأتمتة", description: "Requires settings_access.", tag: "Automation", tagAr: "الأتمتة", authRequired: true, permission: "settings_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Rule list" }] },
  { path: "/api/automation", method: "POST", summary: "Create rule", summaryAr: "إنشاء قاعدة", description: "Requires settings_access.", tag: "Automation", tagAr: "الأتمتة", authRequired: true, permission: "settings_access", requestBody: "{ companySlug, name, trigger, actions, ... }", responses: [{ status: "201", description: "Rule created" }] },
  { path: "/api/automation/{id}", method: "PATCH", summary: "Update rule", summaryAr: "تحديث قاعدة", description: "Update automation rule.", tag: "Automation", tagAr: "الأتمتة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Rule ID" }], responses: [{ status: "200", description: "Updated" }] },
  { path: "/api/automation/{id}", method: "DELETE", summary: "Delete rule", summaryAr: "حذف قاعدة", description: "Delete automation rule.", tag: "Automation", tagAr: "الأتمتة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Rule ID" }], responses: [{ status: "200", description: "Deleted" }] },
  { path: "/api/automation/{id}/logs", method: "GET", summary: "Execution logs", summaryAr: "سجل التنفيذ", description: "Automation execution logs.", tag: "Automation", tagAr: "الأتمتة", authRequired: true, params: [{ name: "id", in: "path", required: true, type: "integer", description: "Rule ID" }], responses: [{ status: "200", description: "Log list" }] },

  // WEBHOOKS
  { path: "/api/webhooks/whatsapp", method: "GET", summary: "WhatsApp verification", summaryAr: "تأكيد ويب هوك", description: "Meta webhook subscription verification.", tag: "Webhooks", tagAr: "ويب هوك", authRequired: false, params: [{ name: "hub.mode", in: "query", required: true, type: "string", description: "subscribe" }, { name: "hub.challenge", in: "query", required: true, type: "string", description: "Challenge" }, { name: "hub.verify_token", in: "query", required: true, type: "string", description: "Verify token" }], responses: [{ status: "200", description: "Challenge echoed" }, { status: "403", description: "Token mismatch" }] },
  { path: "/api/webhooks/whatsapp", method: "POST", summary: "WhatsApp messages", summaryAr: "رسائل WhatsApp", description: "Incoming WhatsApp messages. HMAC-SHA256 verified.", tag: "Webhooks", tagAr: "ويب هوك", authRequired: false, responses: [{ status: "200", description: "Processed (always 200)" }, { status: "403", description: "Invalid signature" }] },

  // SaaS
  { path: "/api/saas/payments", method: "GET", summary: "List payments", summaryAr: "سجل المدفوعات", description: "Founder: all; admin: scoped.", tag: "SaaS", tagAr: "الاشتراكات", authRequired: true, responses: [{ status: "200", description: "Payment transactions" }] },
  { path: "/api/saas/payments/initiate", method: "POST", summary: "Initiate payment", summaryAr: "بدء عملية الدفع", description: "Initiate a payment.", tag: "SaaS", tagAr: "الاشتراكات", authRequired: true, responses: [{ status: "200", description: "Payment initiated" }] },
  { path: "/api/saas/payments/callback", method: "POST", summary: "Payment callback", summaryAr: "رد الدفع", description: "Payment gateway callback.", tag: "SaaS", tagAr: "الاشتراكات", authRequired: false, responses: [{ status: "200", description: "Callback processed" }] },
  { path: "/api/saas/users", method: "GET", summary: "List SaaS users", summaryAr: "قائمة المستخدمين", description: "List SaaS users.", tag: "SaaS", tagAr: "الاشتراكات", authRequired: true, responses: [{ status: "200", description: "User list" }] },

  // REPORTS
  { path: "/api/reports", method: "GET", summary: "Business reports", summaryAr: "تقارير الأعمال", description: "Sales, profit, cashflow, tax reports. CSV export with UTF-8 BOM.", tag: "Reports", tagAr: "التقارير", authRequired: true, permission: "reports_access", params: [{ name: "companySlug", in: "query", required: true, type: "string", description: "companySlug مطلوب" }, { name: "type", in: "query", required: false, type: "string", description: "sales|profit|cashflow|tax" }, { name: "from", in: "query", required: false, type: "string", description: "YYYY-MM-DD" }, { name: "to", in: "query", required: false, type: "string", description: "YYYY-MM-DD" }, { name: "format", in: "query", required: false, type: "string", description: "json|csv" }], responses: [{ status: "200", description: "Report data" }] },

  // HEALTH
  { path: "/api/health", method: "GET", summary: "Health check", summaryAr: "فحص صحة النظام", description: "Unauthenticated. Checks PostgreSQL, Valkey, BullMQ, disk, memory. 200=ok, 503=degraded.", tag: "Health", tagAr: "الصحة", authRequired: false, responses: [{ status: "200", description: "All healthy" }, { status: "503", description: "Degraded" }] },

  // COMPANIES
  { path: "/api/companies", method: "GET", summary: "List companies", summaryAr: "قائمة الشركات", description: "List companies.", tag: "Companies", tagAr: "الشركات", authRequired: true, responses: [{ status: "200", description: "Company list" }] },
  { path: "/api/companies", method: "POST", summary: "Create company", summaryAr: "إنشاء شركة", description: "Create a company.", tag: "Companies", tagAr: "الشركات", authRequired: true, responses: [{ status: "200", description: "Company created" }] },
  { path: "/api/companies/{slug}", method: "GET", summary: "Get company", summaryAr: "عرض شركة", description: "Get company details.", tag: "Companies", tagAr: "الشركات", authRequired: true, params: [{ name: "slug", in: "path", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Company details" }] },
  { path: "/api/companies/{slug}/members", method: "GET", summary: "Company members", summaryAr: "أعضاء الشركة", description: "List company members.", tag: "Companies", tagAr: "الشركات", authRequired: true, params: [{ name: "slug", in: "path", required: true, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Member list" }] },

  // OTHER
  { path: "/api/notifications", method: "GET", summary: "Notifications", summaryAr: "الإشعارات", description: "Get notifications.", tag: "Auth", tagAr: "المصادقة", authRequired: true, responses: [{ status: "200", description: "Notifications" }] },
  { path: "/api/audit", method: "GET", summary: "Audit log", summaryAr: "سجل المراجعة", description: "Audit log entries.", tag: "Settings", tagAr: "الإعدادات", authRequired: true, params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Audit entries" }] },
  { path: "/api/feature-flags", method: "GET", summary: "Feature flags", summaryAr: "علامات الميزات", description: "Get feature flag config.", tag: "Settings", tagAr: "الإعدادات", authRequired: true, responses: [{ status: "200", description: "Feature flags" }] },
  { path: "/api/backups", method: "GET", summary: "List backups", summaryAr: "قائمة النسخ الاحتياطية", description: "List backups.", tag: "Health", tagAr: "الصحة", authRequired: true, responses: [{ status: "200", description: "Backup list" }] },
  { path: "/api/metrics", method: "GET", summary: "Metrics", summaryAr: "مقاييس", description: "Application metrics.", tag: "Health", tagAr: "الصحة", authRequired: true, responses: [{ status: "200", description: "Metrics" }] },
  { path: "/api/startup-check", method: "GET", summary: "Startup check", summaryAr: "فحص البدء", description: "Startup readiness check.", tag: "Health", tagAr: "الصحة", authRequired: false, responses: [{ status: "200", description: "Startup OK" }] },
  { path: "/api/onboarding", method: "POST", summary: "Onboarding wizard", summaryAr: "معالج الإعداد", description: "Company setup wizard.", tag: "Settings", tagAr: "الإعدادات", authRequired: true, responses: [{ status: "200", description: "Step completed" }] },
  { path: "/api/purchases", method: "GET", summary: "Purchase invoices", summaryAr: "فواتير الشراء", description: "List purchase invoices.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Purchase list" }] },
  { path: "/api/invoice-templates", method: "GET", summary: "Invoice templates", summaryAr: "قوالب الفاتورة", description: "List invoice templates.", tag: "Invoices", tagAr: "الفواتير", authRequired: true, params: [{ name: "companySlug", in: "query", required: false, type: "string", description: "Company slug" }], responses: [{ status: "200", description: "Template list" }] },
];

// ─── Method Badge Colors ──────────────────────────────────────────────
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET: { bg: "bg-emerald-100", text: "text-emerald-700" },
  POST: { bg: "bg-blue-100", text: "text-blue-700" },
  PATCH: { bg: "bg-amber-100", text: "text-amber-700" },
  DELETE: { bg: "bg-red-100", text: "text-red-700" },
  PUT: { bg: "bg-purple-100", text: "text-purple-700" },
};

const TAG_COLORS: Record<string, string> = {
  Auth: "#6366f1",
  Invoices: "#f59e0b",
  Clients: "#10b981",
  Catalog: "#8b5cf6",
  Inventory: "#06b6d4",
  Accounting: "#ef4444",
  HR: "#ec4899",
  AI: "#3b82f6",
  Dashboard: "#14b8a6",
  Settings: "#f97316",
  Automation: "#a855f7",
  Webhooks: "#64748b",
  SaaS: "#84cc16",
  Reports: "#e11d48",
  Health: "#22c55e",
  Companies: "#0ea5e9",
};

// ─── Unique Tags ──────────────────────────────────────────────────────
const TAGS = [...new Set(API_ENDPOINTS.map((e) => e.tag))];

export default function ApiDocsPage() {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [lang, setLang] = useState<"en" | "ar">("en");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return API_ENDPOINTS.filter((e) => {
      const tagMatch = !activeTag || e.tag === activeTag;
      const searchMatch =
        !q ||
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.summaryAr.includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q) ||
        e.tagAr.includes(q);
      return tagMatch && searchMatch;
    });
  }, [search, activeTag]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isRtl = lang === "ar";

  return (
    <div
      className={`min-h-screen bg-gray-50 ${isRtl ? "rtl" : "ltr"}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              G
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {isRtl ? "موثقة API جارفكس" : "Garfix EOS API Docs"}
            </h1>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              v12.0.0
            </span>
          </div>

          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="px-3 py-1 text-sm rounded-md border border-gray-200 hover:bg-gray-100 transition"
          >
            {isRtl ? "English" : "عربي"}
          </button>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder={isRtl ? "بحث في API..." : "Search endpoints..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          {/* Stats */}
          <div className="text-sm text-gray-500">
            {filtered.length} {isRtl ? "نقطة نهاية" : "endpoints"}
            {activeTag ? ` (${activeTag})` : ""}
          </div>
        </div>

        {/* ── Tag filters ────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 text-xs rounded-full border transition whitespace-nowrap ${
              !activeTag
                ? "bg-violet-100 text-violet-700 border-violet-300"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {isRtl ? "الكل" : "All"}
          </button>
          {TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1 text-xs rounded-full border transition whitespace-nowrap ${
                activeTag === tag
                  ? "bg-violet-100 text-violet-700 border-violet-300"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: TAG_COLORS[tag] || "#999" }}
              />
              {isRtl
                ? API_ENDPOINTS.find((e) => e.tag === tag)?.tagAr || tag
                : tag}
            </button>
          ))}
        </div>
      </header>

      {/* ── Auth info banner ──────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <div className="font-semibold text-amber-800 mb-1">
            {isRtl ? "المصادقة والتصاريح" : "Authentication & Permissions"}
          </div>
          <div className="text-amber-700">
            {isRtl
              ? "جميع نقاط النهاية (ما عدا /health و /webhooks) تتطلب JWT Bearer عبر HttpOnly cookies. التصاريح: view_invoices, finance_access, settings_access, employee_management, bulk_input, reports_access, edit_customer, create_invoice, edit_invoice, delete_invoice, delete_customer. التصاريح متعددة المستأجرين عبر companySlug أو X-Company-Slug header."
              : "All endpoints (except /health and /webhooks) require JWT Bearer via HttpOnly cookies. Permissions: view_invoices, finance_access, settings_access, employee_management, bulk_input, reports_access, edit_customer, create_invoice, edit_invoice, delete_invoice, delete_customer. Multi-tenant scoping via companySlug query param or X-Company-Slug header."}
          </div>
        </div>
      </div>

      {/* ── Endpoint list ─────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-4 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            {isRtl ? "لا توجد نتائج" : "No endpoints found"}
          </div>
        )}

        {filtered.map((ep) => {
          const key = `${ep.method}-${ep.path}`;
          const expanded = expandedPaths.has(key);
          const mc = METHOD_COLORS[ep.method] || { bg: "bg-gray-100", text: "text-gray-600" };

          return (
            <div
              key={key}
              className="bg-white rounded-lg border hover:border-gray-300 transition"
            >
              <button
                onClick={() => toggleExpand(key)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left"
              >
                <span
                  className={`px-2 py-0.5 text-xs font-bold rounded ${mc.bg} ${mc.text}`}
                >
                  {ep.method}
                </span>
                <span className="text-sm font-mono text-gray-800 flex-1">
                  {ep.path}
                </span>
                <span className="text-sm text-gray-600 hidden sm:block">
                  {isRtl ? ep.summaryAr : ep.summary}
                </span>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: TAG_COLORS[ep.tag] || "#999",
                  }}
                />
                {ep.authRequired && (
                  <span className="text-xs text-amber-600 font-medium">
                    🔒
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expanded && (
                <div className="px-4 pb-4 border-t">
                  {/* Description */}
                  <p className="text-sm text-gray-600 mt-2">
                    {isRtl ? ep.summaryAr : ep.summary} — {ep.description}
                  </p>

                  {/* Permission badge */}
                  {ep.permission && (
                    <div className="mt-2">
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        {isRtl ? "تصريح:" : "Permission:"} {ep.permission}
                      </span>
                    </div>
                  )}

                  {/* Auth badge */}
                  <div className="mt-2 flex gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        ep.authRequired
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {ep.authRequired
                        ? isRtl
                          ? "مصادقة مطلوبة"
                          : "Auth Required"
                        : isRtl
                          ? "بدون مصادقة"
                          : "No Auth"}
                    </span>
                  </div>

                  {/* Parameters */}
                  {ep.params && ep.params.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        {isRtl ? "المعلمات" : "Parameters"}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 border-b">
                              <th className="py-1 pr-2">
                                {isRtl ? "الاسم" : "Name"}
                              </th>
                              <th className="py-1 pr-2">
                                {isRtl ? "الموقع" : "In"}
                              </th>
                              <th className="py-1 pr-2">
                                {isRtl ? "مطلوب" : "Required"}
                              </th>
                              <th className="py-1 pr-2">
                                {isRtl ? "النوع" : "Type"}
                              </th>
                              <th className="py-1">
                                {isRtl ? "الوصف" : "Description"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p, i) => (
                              <tr
                                key={i}
                                className="border-b border-gray-50"
                              >
                                <td className="py-1 pr-2 font-mono text-violet-600">
                                  {p.name}
                                </td>
                                <td className="py-1 pr-2 text-gray-500">
                                  {p.in}
                                </td>
                                <td className="py-1 pr-2">
                                  {p.required ? (
                                    <span className="text-red-500 font-bold">
                                      *
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="py-1 pr-2 text-gray-500">
                                  {p.type}
                                </td>
                                <td className="py-1 text-gray-600">
                                  {p.description}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Request Body */}
                  {ep.requestBody && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        {isRtl ? "هيكل الطلب" : "Request Body"}
                      </h4>
                      <div className="bg-gray-50 rounded p-2 text-xs font-mono text-gray-700">
                        {ep.requestBody}
                      </div>
                    </div>
                  )}

                  {/* Responses */}
                  {ep.responses && ep.responses.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        {isRtl ? "الاستجابات" : "Responses"}
                      </h4>
                      <div className="space-y-1">
                        {ep.responses.map((r, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className={`px-2 py-0.5 text-xs font-bold rounded ${
                                r.status.startsWith("2")
                                  ? "bg-emerald-100 text-emerald-700"
                                  : r.status.startsWith("4")
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {r.status}
                            </span>
                            <span className="text-gray-600">
                              {r.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-400 border-t">
        {isRtl
          ? "موثقة API Garfix EOS — ملف OpenAPI متاح في docs/api/openapi.yaml"
          : "Garfix EOS API Documentation — OpenAPI spec available at docs/api/openapi.yaml"}
      </footer>
    </div>
  );
}
