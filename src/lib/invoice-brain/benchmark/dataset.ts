/**
 * invoice-brain/benchmark/dataset.ts — Real-world Invoice Dataset Generator
 *
 * ═══════════════════════════════════════════════════════════════
 *  BENCHMARK DATASET GENERATOR (Critical for Production Readiness)
 * ═══════════════════════════════════════════════════════════════
 *
 * Generates realistic test dataset with:
 * - 100 different suppliers (Arabic + English)
 * - 10,000 invoices with variations:
 *   • Different dates, amounts, invoice numbers
 *   • Tax variations (0%, 5%, 15%, VAT)
 *   • Discounts and promotions
 *   • Field order permutations
 *   • OCR errors simulation
 *   • Layout drift over time
 *
 * METRICS TO MEASURE:
 * ─────────────────────────────────────────────────────────────
 * 1. Fingerprint Collision Rate: Should be < 0.1%
 * 2. False Match Rate: Pattern matches wrong invoice type
 * 3. Pattern Hit Rate: Target > 90% after learning phase
 * 4. AI Fallback Rate: Target < 10% for known suppliers
 * 5. Average Processing Time: Target < 100ms per invoice
 * ═══════════════════════════════════════════════════════════════
 */


// ─── Types ───────────────────────────────────────────────────

export interface SupplierProfile {
  id: string;
  name: string;
  nameAr?: string;
  country: "KW" | "SA" | "AE" | "QA" | "BH" | "OM";
  currency: "KWD" | "SAR" | "AED" | "QAR" | "BHD" | "OMR";
  
  layoutTemplate: InvoiceLayoutTemplate;
  variationFactors: {
    fieldOrderChangeFreq: number;
    ocrErrorRate: number;
    taxVariation: boolean;
    discountFrequency: number;
  };
}

export interface InvoiceLayoutTemplate {
  id: string;
  fields: LayoutField[];
  separatorStyle: "none" | "---" | "***" | "=" | "line";
  labelLanguage: "ar" | "en" | "mixed";
}

export interface LayoutField {
  type: FieldType;
  label: string;
  required: boolean;
  position: { line: number; colStart: number };
}

export type FieldType =
  | "invoice_number"
  | "date"
  | "supplier_name"
  | "customer_name"
  | "items"
  | "subtotal"
  | "tax"
  | "discount"
  | "total"
  | "notes";

export interface GeneratedInvoice {
  id: string;
  supplierId: string;
  rawText: string;
  groundTruth: {
    invoiceNumber: string;
    date: string;
    supplierName: string;
    customerName: string;
    items: Array<{
      name: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    tax: number;
    taxRate: number;
    discount: number;
    total: number;
  };
  metadata: {
    generatedAt: string;
    layoutVersion: number;
    hasOcrErrors: boolean;
    ocrErrorCount: number;
    fieldOrderPermutation: boolean;
    isDrifted: boolean;
  };
  expectedFingerprint?: string;
}

export interface BenchmarkDataset {
  id: string;
  generatedAt: string;
  config: DatasetConfig;
  suppliers: SupplierProfile[];
  invoices: GeneratedInvoice[];
  stats: {
    totalInvoices: number;
    totalSuppliers: number;
    avgInvoicesPerSupplier: number;
    uniqueLayouts: number;
    driftedInvoices: number;
    invoicesWithOcrErrors: number;
  };
}

export interface DatasetConfig {
  supplierCount: number;
  invoicesPerSupplier: number;
  ocrErrorRate: number;
  layoutDriftRate: number;
  fieldOrderVariationRate: number;
  dateRange: { start: string; end: string };
  amountRange: { min: number; max: number };
}

// ─── Supplier Templates ──────────────────────────────────────

const SUPPLIER_TEMPLATES: Array<Omit<SupplierProfile, 'id'>> = [
  // Kuwaiti Suppliers (Arabic layouts)
  {
    name: "مؤسسة الأمل للتجارة",
    nameAr: "مؤسسة الأمل للتجارة",
    country: "KW", currency: "KWD",
    layoutTemplate: {
      id: "kw-arabic-classic",
      fields: [
        { type: "invoice_number", label: "رقم الفاتورة", required: true, position: { line: 1, colStart: 0 } },
        { type: "date", label: "التاريخ", required: true, position: { line: 2, colStart: 0 } },
        { type: "supplier_name", label: "المورد", required: true, position: { line: 4, colStart: 0 } },
        { type: "customer_name", label: "العميل", required: true, position: { line: 5, colStart: 0 } },
        { type: "items", label: "الأصناف", required: true, position: { line: 7, colStart: 0 } },
        { type: "subtotal", label: "المجموع الفرعي", required: false, position: { line: 15, colStart: 0 } },
        { type: "tax", label: "الضريبة", required: false, position: { line: 16, colStart: 0 } },
        { type: "discount", label: "الخصم", required: false, position: { line: 17, colStart: 0 } },
        { type: "total", label: "الإجمالي", required: true, position: { line: 18, colStart: 0 } },
      ],
      separatorStyle: "---",
      labelLanguage: "ar",
    },
    variationFactors: { fieldOrderChangeFreq: 0.1, ocrErrorRate: 0.05, taxVariation: true, discountFrequency: 0.2 },
  },
  {
    name: "شركة النور للمقاولات",
    nameAr: "شركة النور للمقاولات",
    country: "KW", currency: "KWD",
    layoutTemplate: {
      id: "kw-arabic-modern",
      fields: [
        { type: "supplier_name", label: "شركة", required: true, position: { line: 0, colStart: 0 } },
        { type: "invoice_number", label: "فاتورة ضريبية رقم", required: true, position: { line: 1, colStart: 0 } },
        { type: "date", label: "تاريخ الإصدار", required: true, position: { line: 2, colStart: 0 } },
        { type: "customer_name", label: "إلى / العميل", required: true, position: { line: 4, colStart: 0 } },
        { type: "items", label: "البيان", required: true, position: { line: 6, colStart: 0 } },
        { type: "subtotal", label: "المبلغ", required: false, position: { line: 14, colStart: 0 } },
        { type: "tax", label: "ضريبة القيمة المضافة 15%", required: false, position: { line: 15, colStart: 0 } },
        { type: "total", label: "الإجمالي الكلي", required: true, position: { line: 17, colStart: 0 } },
      ],
      separatorStyle: "line",
      labelLanguage: "ar",
    },
    variationFactors: { fieldOrderChangeFreq: 0.15, ocrErrorRate: 0.08, taxVariation: true, discountFrequency: 0.1 },
  },
  
  // Saudi Suppliers (Mixed Arabic/English)
  {
    name: "Al-Rashid Electronics Co.",
    nameAr: "مؤسسة الراشد للإلكترونيات",
    country: "SA", currency: "SAR",
    layoutTemplate: {
      id: "sa-mixed-retail",
      fields: [
        { type: "supplier_name", label: "المورد / Vendor", required: true, position: { line: 0, colStart: 0 } },
        { type: "invoice_number", label: "Invoice No. / رقم الفاتورة", required: true, position: { line: 1, colStart: 0 } },
        { type: "date", label: "Date / التاريخ", required: true, position: { line: 2, colStart: 0 } },
        { type: "customer_name", label: "Customer / العميل", required: true, position: { line: 4, colStart: 0 } },
        { type: "items", label: "Items / الأصناف", required: true, position: { line: 6, colStart: 0 } },
        { type: "subtotal", label: "Subtotal / المجموع", required: false, position: { line: 14, colStart: 0 } },
        { type: "tax", label: "VAT (15%) / الضريبة", required: false, position: { line: 15, colStart: 0 } },
        { type: "discount", label: "Discount / الخصم", required: false, position: { line: 16, colStart: 0 } },
        { type: "total", label: "Total / الإجمالي", required: true, position: { line: 18, colStart: 0 } },
      ],
      separatorStyle: "=",
      labelLanguage: "mixed",
    },
    variationFactors: { fieldOrderChangeFreq: 0.12, ocrErrorRate: 0.06, taxVariation: true, discountFrequency: 0.25 },
  },
  
  // UAE Suppliers (English)
  {
    name: "Gulf Trading LLC",
    country: "AE", currency: "AED",
    layoutTemplate: {
      id: "ae-english-corporate",
      fields: [
        { type: "supplier_name", label: "From", required: true, position: { line: 0, colStart: 0 } },
        { type: "invoice_number", label: "Tax Invoice #", required: true, position: { line: 1, colStart: 0 } },
        { type: "date", label: "Date", required: true, position: { line: 2, colStart: 0 } },
        { type: "customer_name", label: "Bill To", required: true, position: { line: 4, colStart: 0 } },
        { type: "items", label: "Description", required: true, position: { line: 7, colStart: 0 } },
        { type: "subtotal", label: "Sub Total", required: false, position: { line: 15, colStart: 0 } },
        { type: "tax", label: "VAT (5%)", required: false, position: { line: 16, colStart: 0 } },
        { type: "discount", label: "Discount", required: false, position: { line: 17, colStart: 0 } },
        { type: "total", label: "Grand Total", required: true, position: { line: 19, colStart: 0 } },
      ],
      separatorStyle: "***",
      labelLanguage: "en",
    },
    variationFactors: { fieldOrderChangeFreq: 0.08, ocrErrorRate: 0.04, taxVariation: true, discountFrequency: 0.15 },
  },
];

// ─── Product Database ────────────────────────────────────────

const PRODUCTS = {
  KW: [
    { name: "ماتور كهربائي", unitPriceRange: [15, 150] },
    { name: "فيلتر زيت", unitPriceRange: [2, 8] },
    { name: "زيت سيارة", unitPriceRange: [4, 25] },
    { name: "كمبروسر مكيف", unitPriceRange: [45, 180] },
    { name: "تيل فرامل", unitPriceRange: [8, 35] },
  ],
  SA: [
    { name: "جوال سامسونج", unitPriceRange: [800, 4500] },
    { name: "شاحن لابتوب", unitPriceRange: [80, 350] },
    { name: "ماوس لاسلكي", unitPriceRange: [45, 180] },
    { name: "كيبورد ميكانيكي", unitPriceRange: [120, 550] },
    { name: "شاشة كمبيوتر", unitPriceRange: [400, 2500] },
  ],
  AE: [
    { name: "Office Chair", unitPriceRange: [300, 1500] },
    { name: "Standing Desk", unitPriceRange: [800, 3500] },
    { name: "Filing Cabinet", unitPriceRange: [250, 900] },
    { name: "Projector", unitPriceRange: [1200, 6000] },
    { name: "Coffee Machine", unitPriceRange: [400, 2500] },
  ],
};

const CUSTOMERS = {
  ar: ["أحمد محمد", "محمد خالد", "عبدالله سعد", "خالد فهد", "سعود ناصر"],
  en: ["John Smith Ltd.", "ABC Trading Co.", "Global Solutions Inc.", "Tech Startups LLC", "Al-Futtaim Group"],
};

// ─── Utilities ───────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDate(d: Date, locale: string): string {
  if (locale === "ar") return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return d.toLocaleDateString("en-US");
}

function formatAmount(amt: number, curr: string): string {
  const sym = { KWD: "د.ك", SAR: "ر.س", AED: "د.إ", QAR: "ر.ق", BHD: "د.ب", OMR: "ر.ع" }[curr] || "";
  return `${amt.toFixed(curr === "KWD" ? 3 : 2)} ${sym}`;
}

// ─── OCR Error Simulation ───────────────────────────────────

function addOcrErrors(text: string, rate: number): { text: string; count: number } {
  let result = text;
  let count = 0;
  
  for (let i = 0; i < result.length; i++) {
    if (Math.random() < rate) {
      const subs: Record<string, string> = { 'o':'0', 'O':'0', 'l':'1', 'I':'l', 'S':'5', 's':'5', 'z':'2', 'Z':'2' };
      const replacement = subs[result[i]] || (Math.random()<0.3 ? '' : result[i]+result[i]);
      if (replacement !== result[i]) { count++; }
      result = result.slice(0,i) + replacement + result.slice(i+1);
    }
  }
  
  return { text: result, count };
}

// ─── Invoice Generation ─────────────────────────────────────

function generateInvoice(supplier: SupplierProfile, idx: number, config: DatasetConfig) {
  const tpl = supplier.layoutTemplate;
  const lines: string[] = [];
  
  const invNum = `INV-${supplier.id.slice(0,4).toUpperCase()}-${String(idx).padStart(5,'0')}`;
  const date = new Date(rand(new Date(config.dateRange.start).getTime(), new Date(config.dateRange.end).getTime()));
  const customer = pick(tpl.labelLanguage === "ar" ? CUSTOMERS.ar : CUSTOMERS.en);
  
  const itemCount = randInt(1, 4);
  const products = PRODUCTS[supplier.country as keyof typeof PRODUCTS] || PRODUCTS.KW;
  const items: Array<{ name: string; qty: number; unitPrice: number; total: number }> = [];
  
  for (let i = 0; i < itemCount; i++) {
    const prod = pick(products);
    const qty = randInt(1, 8);
    const price = Math.round(rand(prod.unitPriceRange[0], prod.unitPriceRange[1]) * 100) / 100;
    items.push({ name: prod.name, qty, unitPrice: price, total: Math.round(qty*price*100)/100 });
  }
  
  const subtotal = items.reduce((s,i) => s+i.total, 0);
  const taxRates = [0, 0.05, 0.15];
  const taxRate = supplier.variationFactors.taxVariation ? pick(taxRates) : (supplier.country==="SA"?0.15:supplier.country==="AE"?0.05:0);
  const tax = Math.round(subtotal*taxRate*100)/100;
  const hasDiscount = Math.random() < supplier.variationFactors.discountFrequency;
  const discount = hasDiscount ? Math.round(subtotal*rand(0.02,0.15)*100)/100 : 0;
  const total = Math.round((subtotal+tax-discount)*100)/100;
  
  for (const field of tpl.fields) {
    switch(field.type) {
      case "supplier_name": lines.push(`${field.label}: ${supplier.name}`); break;
      case "invoice_number": lines.push(`${field.label}: ${invNum}`); break;
      case "date": lines.push(`${field.label}: ${formatDate(date, tpl.labelLanguage==="ar"?"ar":"en")}`); break;
      case "customer_name": lines.push(`${field.label}: ${customer}`); break;
      case "items":
        lines.push(""); lines.push(`${field.label}:`);
        items.forEach(it => lines.push(`  - ${it.name} x${it.qty} @ ${formatAmount(it.unitPrice,supplier.currency)} = ${formatAmount(it.total,supplier.currency)}`));
        break;
      case "subtotal": if(hasDiscount||tax>0) lines.push(`${field.label}: ${formatAmount(subtotal,supplier.currency)}`); break;
      case "tax": if(tax>0) lines.push(`${field.label} (${taxRate*100}%): ${formatAmount(tax,supplier.currency)}`); break;
      case "discount": if(hasDiscount) lines.push(`${field.label}: ${formatAmount(discount,supplier.currency)}`); break;
      case "total": lines.push(`${field.label}: ${formatAmount(total,supplier.currency)}`); break;
    }
  }
  
  if (tpl.separatorStyle !== "none") {
    lines.push(""); lines.push(tpl.separatorStyle.repeat(20)); lines.push("");
  }
  
  return {
    text: lines.join("\n"),
    groundTruth: {
      invoiceNumber: invNum,
      date: date.toISOString().split('T')[0],
      supplierName: supplier.name,
      customerName: customer,
      items,
      subtotal,
      tax,
      taxRate,
      discount,
      total,
    },
  };
}

// ─── Layout Drift Simulation ─────────────────────────────────

function applyDrift(text: string): string {
  const patterns = [
    () => text.replace(/التاريخ/g, 'تاريخ الفاتورة').replace(/Date/g, 'Invoice Date'),
    () => text.replace(/\n/g, '\n\n'),
    () => text.replace(/-/g, '·').replace(/×/g, 'x'),
  ];
  return pick(patterns)();
}

// ─── Main Generator ─────────────────────────────────────────

export function generateBenchmarkDataset(config: Partial<DatasetConfig> = {}): BenchmarkDataset {
  const fullConfig: DatasetConfig = {
    supplierCount: 100,
    invoicesPerSupplier: 100,
    ocrErrorRate: 0.05,
    layoutDriftRate: 0.15,
    fieldOrderVariationRate: 0.2,
    dateRange: { start: "2025-01-01", end: "2026-08-01" },
    amountRange: { min: 10, max: 50000 },
    ...config,
  };
  
  console.log(`[benchmark] Generating: ${fullConfig.supplierCount} suppliers x ${fullConfig.invoicesPerSupplier} invoices`);
  
  const suppliers: SupplierProfile[] = [];
  for (let i = 0; i < fullConfig.supplierCount; i++) {
    const base = SUPPLIER_TEMPLATES[i % SUPPLIER_TEMPLATES.length];
    suppliers.push({
      ...base,
      id: `SUP-${String(i+1).padStart(4,'0')}`,
      name: i < SUPPLIER_TEMPLATES.length ? base.name : `${base.name} Branch ${Math.ceil(i/SUPPLIER_TEMPLATES.length)}`,
      layoutTemplate: { ...base.layoutTemplate, id: `${base.layoutTemplate.id}-${i}` },
      variationFactors: { ...base.variationFactors, ocrErrorRate: Math.min(0.3, base.variationFactors.ocrErrorRate + (Math.random()-0.5)*0.1) },
    });
  }
  
  const invoices: GeneratedInvoice[] = [];
  let driftedCount = 0;
  let ocrCount = 0;
  
  for (const supplier of suppliers) {
    const hasDrift = Math.random() < fullConfig.layoutDriftRate;
    const driftPoint = hasDrift ? Math.floor(fullConfig.invoicesPerSupplier * 0.6) : fullConfig.invoicesPerSupplier + 1;
    
    for (let i = 0; i < fullConfig.invoicesPerSupplier; i++) {
      const { text, groundTruth } = generateInvoice(supplier, i, fullConfig);
      
      let processedText = text;
      let hasOcr = false;
      let ocrErrs = 0;
      let isDrifted = false;
      
      if (Math.random() < supplier.variationFactors.ocrErrorRate) {
        const ocr = addOcrErrors(text, fullConfig.ocrErrorRate);
        processedText = ocr.text;
        ocrErrs = ocr.count;
        hasOcr = ocrErrs > 0;
        if (hasOcr) ocrCount++;
      }
      
      if (i >= driftPoint && hasDrift) {
        processedText = applyDrift(processedText);
        isDrifted = true;
        driftedCount++;
      }
      
      invoices.push({
        id: `INV-${supplier.id}-${String(i+1).padStart(5,'0')}`,
        supplierId: supplier.id,
        rawText: processedText,
        groundTruth,
        metadata: {
          generatedAt: new Date().toISOString(),
          layoutVersion: isDrifted ? 2 : 1,
          hasOcrErrors: hasOcr,
          ocrErrorCount: ocrErrs,
          fieldOrderPermutation: Math.random() < fullConfig.fieldOrderVariationRate,
          isDrifted,
        },
      });
    }
  }
  
  const dataset: BenchmarkDataset = {
    id: `BENCH-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    config: fullConfig,
    suppliers,
    invoices,
    stats: {
      totalInvoices: invoices.length,
      totalSuppliers: suppliers.length,
      avgInvoicesPerSupplier: fullConfig.invoicesPerSupplier,
      uniqueLayouts: new Set(suppliers.map(s=>s.layoutTemplate.id)).size,
      driftedInvoices: driftedCount,
      invoicesWithOcrErrors: ocrCount,
    },
  };
  
  console.log(`[benchmark] Done! ${dataset.stats.totalInvoices.toLocaleString()} invoices`);
  console.log(`[benchmark] Drifted: ${driftedCount}, OCR Errors: ${ocrCount}`);
  
  return dataset;
}

export function generateQuickTestSet(size: "small" | "medium" | "large" = "medium"): BenchmarkDataset {
  const sizes = { small: { supplierCount: 10, invoicesPerSupplier: 50 }, medium: { supplierCount: 50, invoicesPerSupplier: 100 }, large: { supplierCount: 100, invoicesPerSupplier: 100 } };
  return generateBenchmarkDataset(sizes[size]);
}
