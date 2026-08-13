/**
 * Minimal seed for preview/testing — creates one founder user + one SA company
 * + basic accounts + sample client + sample invoice.
 *
 * Run with DATABASE_URL + DATABASE_DIRECT_URL env vars set.
 *
 * Usage: bunx tsx scripts/seed-minimal.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Seeding minimal preview data...");

  // 1. Company (Saudi Arabia — for e-invoicing demo)
  const company = await db.company.upsert({
    where: { slug: "sa-demo" },
    update: {},
    create: {
      name: "GarfiX Saudi Demo",
      slug: "sa-demo",
      nameAr: "شركة جارفيكس السعودية التجريبية",
      currency: "SAR",
      vatNumber: "300000000000003",
      address: "الرياض، حي العليا",
      country: "SA",
      plan: "enterprise",
      subscriptionStatus: "active",
      currencyDecimalPlaces: 2,
      phone: "+966500000000",
      emoji: "🏢",
      color: "#047857",
    },
  } as any);
  console.log(`✅ Company: ${company.nameAr} (${company.slug})`);

  // 2. Founder user
  const bcrypt = await import("bcryptjs");
  const passwordHash = bcrypt.hashSync("admin123", 12);
  const user = await db.appUser.upsert({
    where: { email: "admin@garfix.com" },
    update: { passwordHash },
    create: {
      uid: "founder-001",
      email: "admin@garfix.com",
      passwordHash,
      displayName: "Founder Admin",
      role: "founder",
      companies: JSON.stringify([company.slug]),
      emailVerified: true,
    },
  });
  console.log(`✅ User: ${user.email} (founder) — password: admin123`);

  // 3. A second user (employee) for the same company
  const empHash = bcrypt.hashSync("emp123", 12);
  const employee = await db.appUser.upsert({
    where: { email: "employee@garfix.com" },
    update: {},
    create: {
      uid: "emp-001",
      email: "employee@garfix.com",
      passwordHash: empHash,
      displayName: "Test Employee",
      role: "employee",
      companies: JSON.stringify([company.slug]),
      emailVerified: true,
    },
  });
  console.log(`✅ User: ${employee.email} (employee) — password: emp123`);

  // 4. A few chart of accounts
  const accounts = [
    { code: "1000", nameAr: "النقدية", nameEn: "Cash", type: "asset" },
    { code: "1100", nameAr: "العملاء", nameEn: "Accounts Receivable", type: "asset" },
    { code: "1200", nameAr: "المخزون", nameEn: "Inventory", type: "asset" },
    { code: "2000", nameAr: "الموردون", nameEn: "Accounts Payable", type: "liability" },
    { code: "4000", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue" },
    { code: "5000", nameAr: "تكلفة البضاعة المباعة", nameEn: "Cost of Goods Sold", type: "expense" },
  ];
  for (const acc of accounts) {
    await db.account.create({
      data: {
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
        companySlug: company.slug,
      } as any,
    }).catch(() => {});
  }
  console.log(`✅ ${accounts.length} accounts created`);

  // 5. A sample client
  const client = await db.client.create({
    data: {
      name: "عميل تجريبي",
      nameEn: "Demo Client",
      email: "client@example.com",
      phone: "+966511111111",
      address: "جدة، حي الروضة",
      companySlug: company.slug,
      taxId: "300000000000004",
    } as any,
  }).catch(() => null);
  if (client) console.log(`✅ Client: ${client.nameEn}`);

  // 6. A sample product
  const product = await db.productCatalog.create({
    data: {
      id: "prod-001",
      name: "استشارات تقنية",
      nameAr: "استشارات تقنية",
      price: 100,
      sku: "CONS-001",
      companySlug: company.slug,
      currency: "SAR",
    },
  }).catch(() => null);
  if (product) console.log(`✅ Product: ${product.nameAr}`);

  // 7. A sample invoice (with ZATCA fields)
  const invoice = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0001",
      clientName: "عميل تجريبي",
      companySlug: company.slug,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      total: 1150,
      subtotal: 1000,
      taxAmount: 150,
      taxRate: 15,
      status: "draft",
      lineItems: JSON.stringify([
        { descriptionAr: "استشارات تقنية", descriptionEn: "Technical Consulting", qty: 10, unitPrice: 100, lineTotal: 1000, taxRate: 15, taxAmount: 150 },
      ]),
      lineItemsAr: JSON.stringify([
        { descriptionAr: "استشارات تقنية", qty: 10, unitPrice: 100, lineTotal: 1000, taxRate: 15, taxAmount: 150 },
      ]),
      sellerNameAr: company.nameAr || "",
      sellerAddressAr: company.address || "",
      buyerNameAr: "عميل تجريبي",
      buyerAddressAr: "جدة، حي الروضة",
      buyerVatTrn: "300000000000004",
      invoiceTypeAr: "فاتورة ضريبية",
      invoiceTypeEn: "Tax Invoice",
      currency: "SAR",
      eInvoiceAuthority: "zatca",
    },
  }).catch(() => null);
  if (invoice) console.log(`✅ Invoice: ${invoice.invoiceNumber} (id=${invoice.id})`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Minimal seed complete!");
  console.log("  Login: admin@garfix.com / admin123 (founder)");
  console.log("  Or:    employee@garfix.com / emp123 (employee)");
  console.log("  Company slug: sa-demo (country=SA)");
  console.log("═══════════════════════════════════════════════════");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
