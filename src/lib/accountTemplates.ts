/**
 * accountTemplates.ts — Pre-built chart-of-accounts templates by business type.
 *
 * When a new company is created via the onboarding wizard, the wizard asks
 * the business type and generates a matching account tree automatically,
 * so the user doesn't have to set up accounting from scratch.
 */

export type BusinessType =
  | "retail"      // تجزئة
  | "wholesale"   // جملة
  | "services"    // خدمات
  | "manufacturing" // تصنيع
  | "restaurant"  // مطعم/تموين
  | "trading";    // تجارة عامة

export interface AccountTemplate {
  code: string;
  nameAr: string;
  nameEn: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense" | "contra_revenue" | "contra_asset";
  balance?: string;
}

export const BUSINESS_TYPES: Array<{ value: BusinessType; labelAr: string; labelEn: string; icon: string }> = [
  { value: "retail", labelAr: "تجزئة", labelEn: "Retail", icon: "🛍️" },
  { value: "wholesale", labelAr: "جملة", labelEn: "Wholesale", icon: "📦" },
  { value: "services", labelAr: "خدمات", labelEn: "Services", icon: "🔧" },
  { value: "manufacturing", labelAr: "تصنيع", labelEn: "Manufacturing", icon: "🏭" },
  { value: "restaurant", labelAr: "مطعم/تموين", labelEn: "Restaurant", icon: "🍽️" },
  { value: "trading", labelAr: "تجارة عامة", labelEn: "General Trading", icon: "💼" },
];

// Common accounts shared by all business types
const COMMON_ACCOUNTS: AccountTemplate[] = [
  // Assets
  { code: "1000", nameAr: "النقدية", nameEn: "Cash", type: "asset", balance: "0" },
  { code: "1010", nameAr: "البنك", nameEn: "Bank", type: "asset", balance: "0" },
  { code: "1100", nameAr: "العملاء (ذمم مدينة)", nameEn: "Accounts Receivable", type: "asset", balance: "0" },
  { code: "1200", nameAr: "المخزون", nameEn: "Inventory", type: "asset", balance: "0" },
  { code: "1500", nameAr: "أصول ثابتة", nameEn: "Fixed Assets", type: "asset", balance: "0" },
  // Liabilities
  { code: "2000", nameAr: "الموردون (ذمم دائنة)", nameEn: "Accounts Payable", type: "liability", balance: "0" },
  { code: "2100", nameAr: "ضريبة القيمة المضافة المستحقة", nameEn: "VAT Payable", type: "liability", balance: "0" },
  { code: "2200", nameAr: "رواتب مستحقة", nameEn: "Salaries Payable", type: "liability", balance: "0" },
  // Equity
  { code: "3000", nameAr: "رأس المال", nameEn: "Capital", type: "equity", balance: "0" },
  { code: "3100", nameAr: "أرباح مرحّلة", nameEn: "Retained Earnings", type: "equity", balance: "0" },
  // Revenue
  { code: "4000", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", balance: "0" },
  { code: "4100", nameAr: "إيرادات أخرى", nameEn: "Other Revenue", type: "revenue", balance: "0" },
  { code: "4900", nameAr: "مرتجعات المبيعات", nameEn: "Sales Returns", type: "contra_revenue", balance: "0" },
  // Expenses
  { code: "5000", nameAr: "تكلفة البضاعة المباعة", nameEn: "Cost of Goods Sold", type: "expense", balance: "0" },
  { code: "5100", nameAr: "الرواتب والأجور", nameEn: "Salaries & Wages", type: "expense", balance: "0" },
  { code: "5200", nameAr: "الإيجار", nameEn: "Rent", type: "expense", balance: "0" },
  { code: "5300", nameAr: "كهرباء ومياه", nameEn: "Utilities", type: "expense", balance: "0" },
  { code: "5400", nameAr: "تسويق وإعلان", nameEn: "Marketing", type: "expense", balance: "0" },
  { code: "5900", nameAr: "مصروفات عمومية وإدارية", nameEn: "General & Admin", type: "expense", balance: "0" },
];

// Business-specific additional accounts
const BUSINESS_SPECIFIC: Record<BusinessType, AccountTemplate[]> = {
  retail: [
    { code: "1210", nameAr: "مخزون بضاعة للبيع", nameEn: "Merchandise Inventory", type: "asset", balance: "0" },
    { code: "5010", nameAr: "مشتريات بضاعة", nameEn: "Purchases", type: "expense", balance: "0" },
    { code: "5020", nameAr: "خصم مكتسب", nameEn: "Purchase Discount", type: "expense", balance: "0" },
  ],
  wholesale: [
    { code: "1210", nameAr: "مخزون بضاعة جملة", nameEn: "Wholesale Inventory", type: "asset", balance: "0" },
    { code: "5010", nameAr: "مشتريات جملة", nameEn: "Wholesale Purchases", type: "expense", balance: "0" },
    { code: "5020", nameAr: "نقل وتحميل", nameEn: "Freight & Loading", type: "expense", balance: "0" },
  ],
  services: [
    { code: "4000", nameAr: "إيرادات الخدمات", nameEn: "Service Revenue", type: "revenue", balance: "0" },
    { code: "5500", nameAr: "مصروفات تشغيل الخدمة", nameEn: "Service Delivery Costs", type: "expense", balance: "0" },
  ],
  manufacturing: [
    { code: "1220", nameAr: "مخزون المواد الخام", nameEn: "Raw Materials", type: "asset", balance: "0" },
    { code: "1230", nameAr: "مخزون تحت التشغيل", nameEn: "Work in Progress", type: "asset", balance: "0" },
    { code: "1240", nameAr: "مخزون منتجات تامة", nameEn: "Finished Goods", type: "asset", balance: "0" },
    { code: "5010", nameAr: "مواد خام مستخدمة", nameEn: "Raw Materials Used", type: "expense", balance: "0" },
    { code: "5020", nameAr: "أجور مصنع", nameEn: "Factory Wages", type: "expense", balance: "0" },
    { code: "5030", nameAr: "مصروفات مصنع عمومية", nameEn: "Factory Overhead", type: "expense", balance: "0" },
  ],
  restaurant: [
    { code: "1210", nameAr: "مخزون مواد غذائية", nameEn: "Food Inventory", type: "asset", balance: "0" },
    { code: "5010", nameAr: "تكلفة المأكولات", nameEn: "Food Cost", type: "expense", balance: "0" },
    { code: "5020", nameAr: "تكلفة المشروبات", nameEn: "Beverage Cost", type: "expense", balance: "0" },
    { code: "5600", nameAr: "مصروفات نظافة", nameEn: "Cleaning Supplies", type: "expense", balance: "0" },
  ],
  trading: [
    { code: "1210", nameAr: "مخزون تجاري", nameEn: "Trading Inventory", type: "asset", balance: "0" },
    { code: "5010", nameAr: "مشتريات", nameEn: "Purchases", type: "expense", balance: "0" },
    { code: "5020", nameAr: "عمولات وسيط", nameEn: "Brokerage Fees", type: "expense", balance: "0" },
  ],
};

/**
 * Get the full account tree for a business type.
 * Merges common accounts + business-specific accounts.
 */
export function getAccountTemplate(businessType: BusinessType): AccountTemplate[] {
  const specific = BUSINESS_SPECIFIC[businessType] || [];
  // Merge, avoiding duplicate codes (specific overrides common if same code)
  const codeMap = new Map<string, AccountTemplate>();
  for (const acc of COMMON_ACCOUNTS) codeMap.set(acc.code, acc);
  for (const acc of specific) codeMap.set(acc.code, acc);
  return Array.from(codeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Get recommended modules to activate based on onboarding answers.
 */
export function getRecommendedModules(answers: {
  businessType: BusinessType;
  hasEmployees: boolean;
  hasWarehouse: boolean;
  usesWhatsApp: boolean;
}): string[] {
  const modules = ["invoices", "clients", "catalog", "purchases", "ai_copilot"];
  if (answers.hasEmployees) modules.push("hr");
  modules.push("accounting"); // always needed
  if (answers.usesWhatsApp) modules.push("whatsapp");
  if (answers.businessType === "manufacturing" || answers.hasWarehouse) modules.push("inventory");
  return modules;
}
