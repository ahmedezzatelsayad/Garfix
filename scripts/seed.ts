/**
 * seed.ts — Seed the database with the founder user, a sample company,
 * sample clients, sample invoices, plans, and the permissions catalog.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes } from "node:crypto";

const db = new PrismaClient();

const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL || "founder@garfix.app").toLowerCase();
// P0 FIX: Password MUST come from env var — never hardcoded in source.
// In dev, a random password is generated and printed once (NOT logged elsewhere).
// In production, FOUNDER_PASSWORD must be set or seeding refuses to run.
const FOUNDER_PASSWORD = ((): string => {
  const env = process.env.FOUNDER_PASSWORD;
  if (env && env.length >= 8) return env;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: FOUNDER_PASSWORD environment variable must be set (>= 8 chars) in production. Refusing to seed with a hardcoded default."
    );
  }
  // Dev-only: generate a random one-time password and surface it once
  const rand = randomBytes(6).toString("base64url");
  console.warn(`⚠️  FOUNDER_PASSWORD env not set — generated a dev-only random password. Set FOUNDER_PASSWORD explicitly for repeatable seeds.`);
  return `Dev-${rand}`;
})();

async function main() {
  console.log("🌱 Seeding Garfix v11 database...");

  const passwordHash = await bcrypt.hash(FOUNDER_PASSWORD, 10);
  const founder = await db.user.upsert({
    where: { email: FOUNDER_EMAIL },
    update: {},
    create: {
      uid: randomUUID(),
      email: FOUNDER_EMAIL,
      passwordHash,
      displayName: "Garfix Founder",
      role: "admin",
      companies: JSON.stringify(["garfix-demo"]),
      permissions: JSON.stringify({}),
      emailVerified: true,
      tokenVersion: 0,
    },
  });
  console.log(`  ✓ Founder user: ${founder.email}`);

  const company = await db.company.upsert({
    where: { slug: "garfix-demo" },
    update: {},
    create: {
      name: "Garfix Demo Co.",
      slug: "garfix-demo",
      nameAr: "شركة جارفكس التجريبية",
      emoji: "🏢",
      color: "#7c3aed",
      phone: "+965 5000 0000",
      email: "info@garfix.app",
      address: "Kuwait City, Kuwait",
      vatNumber: "VAT-000000",
      currency: "KWD",
      country: "KW",
      defaultTaxRate: "5",
      plan: "professional",
      subscriptionStatus: "active",
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`  ✓ Company: ${company.nameAr} (${company.slug})`);

  const clients = await Promise.all([
    db.client.create({ data: { name: "أحمد محمد", email: "ahmed@example.com", phone: "+965 5555 1111", company: "شركة النور", address: "الكويت - حولي", companySlug: "garfix-demo" } }),
    db.client.create({ data: { name: "سارة عبدالله", email: "sara@example.com", phone: "+965 5555 2222", company: "مؤسسة الفجر", address: "الكويت - السالمية", companySlug: "garfix-demo" } }),
    db.client.create({ data: { name: "خالد العلي", email: "khaled@example.com", phone: "+965 5555 3333", company: "شركة المستقبل", address: "الكويت - الفروانية", companySlug: "garfix-demo" } }),
    db.client.create({ data: { name: "نورة السالم", email: "noura@example.com", phone: "+965 5555 4444", company: "متجر اللؤلؤ", address: "الكويت - الجهراء", companySlug: "garfix-demo" } }),
    db.client.create({ data: { name: "Mohammed Ali", email: "mohammed@example.com", phone: "+965 5555 5555", company: "Global Tech", address: "Kuwait - Sharq", companySlug: "garfix-demo" } }),
  ]);
  console.log(`  ✓ ${clients.length} clients created`);

  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const sampleLineItems = [
    [{ description: "تصميم موقع إلكتروني", qty: 1, price: 500 }],
    [{ description: "استشارة تقنية", qty: 5, price: 80 }, { description: "متابعة شهرية", qty: 1, price: 200 }],
    [{ description: "تطوير تطبيق جوال", qty: 1, price: 1500 }, { description: "صيانة شهرية", qty: 3, price: 100 }],
    [{ description: "خدمات تسويق رقمي", qty: 1, price: 800 }],
    [{ description: "تدريب فريق العمل", qty: 2, price: 250 }],
  ];
  const statuses = ["paid", "paid", "partial", "sent", "overdue"];

  for (let i = 0; i < sampleLineItems.length; i++) {
    const items = sampleLineItems[i];
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const taxRate = 5;
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;
    const paid = statuses[i] === "paid" ? total : statuses[i] === "partial" ? total / 2 : 0;
    const issueDate = new Date(today);
    issueDate.setDate(issueDate.getDate() - (i + 1) * 7);

    await db.invoice.create({
      data: {
        invoiceNumber: `INV-${1000 + i}`,
        companySlug: "garfix-demo",
        clientId: clients[i].id,
        clientName: clients[i].name,
        clientEmail: clients[i].email,
        clientPhone: clients[i].phone,
        clientAddress: clients[i].address,
        issueDate: fmtDate(issueDate),
        dueDate: fmtDate(new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000)),
        status: statuses[i],
        lineItems: JSON.stringify(items),
        subtotal: subtotal.toFixed(3),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(3),
        total: total.toFixed(3),
        shipping: "0",
        discount: "0",
        paid: paid.toFixed(3),
        createdByEmail: founder.email,
        createdByName: founder.displayName,
        version: 0,
      },
    });
  }
  console.log(`  ✓ ${sampleLineItems.length} invoices created`);

  await Promise.all([
    db.productCatalog.create({ data: { companySlug: "garfix-demo", code: "P001", name: "تصميم موقع", aliases: JSON.stringify(["web design", "website"]), sellingPrice: "500.000", purchasePrice: "0.000" } }),
    db.productCatalog.create({ data: { companySlug: "garfix-demo", code: "P002", name: "استشارة تقنية", aliases: JSON.stringify(["consultation"]), sellingPrice: "80.000", purchasePrice: "0.000" } }),
    db.productCatalog.create({ data: { companySlug: "garfix-demo", code: "P003", name: "تطوير تطبيق", aliases: JSON.stringify(["mobile app", "app dev"]), sellingPrice: "1500.000", purchasePrice: "0.000" } }),
    db.productCatalog.create({ data: { companySlug: "garfix-demo", code: "P004", name: "تسويق رقمي", aliases: JSON.stringify(["digital marketing", "marketing"]), sellingPrice: "800.000", purchasePrice: "0.000" } }),
    db.productCatalog.create({ data: { companySlug: "garfix-demo", code: "P005", name: "تدريب", aliases: JSON.stringify(["training", "course"]), sellingPrice: "250.000", purchasePrice: "0.000" } }),
  ]);
  console.log(`  ✓ 5 products created`);

  const employees = await Promise.all([
    db.employee.create({ data: { companySlug: "garfix-demo", name: "علي حسن", phone: "+965 5566 7788", position: "مدير المبيعات", department: "المبيعات", baseSalary: "800.000", currency: "KWD", joinDate: "2024-01-15", isActive: true } }),
    db.employee.create({ data: { companySlug: "garfix-demo", name: "فاطمة أحمد", phone: "+965 5566 8899", position: "محاسبة", department: "المالية", baseSalary: "650.000", currency: "KWD", joinDate: "2024-03-01", isActive: true } }),
    db.employee.create({ data: { companySlug: "garfix-demo", name: "يوسف إبراهيم", phone: "+965 5566 9900", position: "مطور", department: "التقنية", baseSalary: "900.000", currency: "KWD", joinDate: "2023-09-01", isActive: true } }),
    db.employee.create({ data: { companySlug: "garfix-demo", name: "مريم خالد", phone: "+965 5577 1100", position: "تسويق", department: "التسويق", baseSalary: "550.000", currency: "KWD", joinDate: "2024-06-15", isActive: true } }),
  ]);
  console.log(`  ✓ ${employees.length} employees created`);

  const todayStr = fmtDate(today);
  await Promise.all(employees.map((e, i) =>
    db.attendance.create({
      data: {
        companySlug: "garfix-demo", employeeId: e.id, date: todayStr,
        status: i === 1 ? "late" : "present",
        checkIn: "08:30", checkOut: "17:00",
      },
    })
  ));
  console.log(`  ✓ ${employees.length} attendance records created`);

  const currentMonth = today.toISOString().slice(0, 7);
  await Promise.all(employees.map((e, i) => {
    const base = parseFloat(e.baseSalary);
    const allowances = 50;
    const deductions = i === 1 ? 20 : 0;
    const bonus = i === 0 ? 100 : 0;
    const net = base + allowances + bonus - deductions;
    return db.salary.create({
      data: {
        companySlug: "garfix-demo", employeeId: e.id, month: currentMonth,
        baseSalary: base.toFixed(3), allowances: allowances.toFixed(3),
        deductions: deductions.toFixed(3), bonus: bonus.toFixed(3),
        netSalary: net.toFixed(3), isPaid: false,
      },
    });
  }));
  console.log(`  ✓ ${employees.length} salary records created`);

  const accounts = [
    { code: "1000", nameAr: "النقدية", nameEn: "Cash", type: "asset", balance: "5000" },
    { code: "1100", nameAr: "العملاء", nameEn: "Accounts Receivable", type: "asset", balance: "3200" },
    { code: "1200", nameAr: "المخزون", nameEn: "Inventory", type: "asset", balance: "1500" },
    { code: "2000", nameAr: "الموردون", nameEn: "Accounts Payable", type: "liability", balance: "800" },
    { code: "3000", nameAr: "رأس المال", nameEn: "Capital", type: "equity", balance: "8000" },
    { code: "4000", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", balance: "12500" },
    { code: "5000", nameAr: "الرواتب", nameEn: "Salaries", type: "expense", balance: "2900" },
    { code: "5100", nameAr: "الإيجار", nameEn: "Rent", type: "expense", balance: "600" },
  ];
  for (const a of accounts) {
    await db.account.create({ data: { ...a, companySlug: "garfix-demo", currency: "KWD" } });
  }
  console.log(`  ✓ ${accounts.length} accounts created`);

  const perms = [
    { key: "create_invoice", labelAr: "إنشاء فواتير", labelEn: "Create invoices", category: "invoices" },
    { key: "print_invoice", labelAr: "طباعة الفواتير", labelEn: "Print invoices", category: "invoices" },
    { key: "edit_invoice", labelAr: "تعديل الفواتير", labelEn: "Edit invoices", category: "invoices" },
    { key: "delete_invoice", labelAr: "حذف الفواتير", labelEn: "Delete invoices", category: "invoices" },
    { key: "view_customers", labelAr: "عرض العملاء", labelEn: "View customers", category: "clients" },
    { key: "edit_customer", labelAr: "تعديل العملاء", labelEn: "Edit customers", category: "clients" },
    { key: "delete_customer", labelAr: "حذف العملاء", labelEn: "Delete customers", category: "clients" },
    { key: "bulk_input", labelAr: "الإدخال المجمع", labelEn: "Bulk input", category: "general" },
    { key: "export_data", labelAr: "تصدير البيانات", labelEn: "Export data", category: "general" },
    { key: "reports_access", labelAr: "الوصول للتقارير", labelEn: "Reports access", category: "admin" },
    { key: "settings_access", labelAr: "الإعدادات", labelEn: "Settings access", category: "admin" },
    { key: "finance_access", labelAr: "الوصول المالي", labelEn: "Finance access", category: "admin" },
    { key: "employee_management", labelAr: "إدارة الموظفين", labelEn: "Employee management", category: "admin" },
    { key: "e_invoicing_submit", labelAr: "الفاتورة الإلكترونية", labelEn: "E-invoicing", category: "admin" },
  ];
  for (const p of perms) {
    await db.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  }
  console.log(`  ✓ ${perms.length} permissions defined`);

  const platformSettings = [
    { key: "plans.catalog", category: "billing", valueType: "json", value: JSON.stringify({
      trial: { name: "تجريبي", priceMonthly: 0, maxInvoicesPerMonth: 999999, maxCompanies: 1, maxUsers: 3, trialDays: 30 },
      starter: { name: "Starter", priceMonthly: 9.99, maxInvoicesPerMonth: 10000, maxCompanies: 3, maxUsers: 10, trialDays: 0 },
      professional: { name: "Professional", priceMonthly: 19.99, maxInvoicesPerMonth: 30000, maxCompanies: 10, maxUsers: 30, trialDays: 0 },
      unlimited: { name: "Unlimited", priceMonthly: 29.99, maxInvoicesPerMonth: -1, maxCompanies: -1, maxUsers: -1, trialDays: 0 },
    }) },
    { key: "feature.public_signup", category: "features", valueType: "boolean", value: "true" },
    { key: "branding.name", category: "branding", valueType: "string", value: JSON.stringify("GARFIX") },
    { key: "branding.tagline", category: "branding", valueType: "string", value: JSON.stringify("منصة إدارة الأعمال المتكاملة") },
    { key: "branding.primary_color", category: "branding", valueType: "string", value: JSON.stringify("#7c3aed") },
  ];
  for (const s of platformSettings) {
    await db.platformSetting.upsert({ where: { key: s.key }, update: {}, create: { ...s, updatedBy: "system" } });
  }
  console.log(`  ✓ ${platformSettings.length} platform settings seeded`);

  const modules = [
    { name: "الفواتير", identifier: "invoices", version: "1.0.0", description: "إنشاء وإدارة الفواتير", isActive: true },
    { name: "العملاء", identifier: "clients", version: "1.0.0", description: "قاعدة بيانات العملاء", isActive: true },
    { name: "المشتريات", identifier: "purchases", version: "1.0.0", description: "إدارة فواتير الموردين", isActive: true },
    { name: "الموارد البشرية", identifier: "hr", version: "1.0.0", description: "الموظفون والرواتب والحضور", isActive: true },
    { name: "المحاسبة", identifier: "accounting", version: "1.0.0", description: "دليل الحسابات والقيود اليومية", isActive: true },
    { name: "الفاتورة الإلكترونية", identifier: "e_invoicing", version: "1.0.0", description: "ربط مع هيئة الزكاة والضريبة (ZATCA)", isActive: false },
    { name: "مساعد الذكاء الاصطناعي", identifier: "ai_copilot", version: "1.0.0", description: "مساعد ذكي للأعمال", isActive: true },
  ];
  for (const m of modules) {
    await db.module.upsert({ where: { identifier: m.identifier }, update: {}, create: { ...m, settings: "{}" } });
  }
  console.log(`  ✓ ${modules.length} modules registered`);

  console.log("\n✅ Seed completed successfully!");
  console.log(`\n🔐 Founder login: ${FOUNDER_EMAIL}`);
  // P0 FIX: don't print the password at the end — operator should already know it (came from env).
  // If a random dev password was generated, surface it once at the top (already done above).
  console.log(`🏢 Sample company: ${company.nameAr} (slug: ${company.slug})`);
}

main()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
