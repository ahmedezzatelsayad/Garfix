/**
 * test-invoice-brain-10.ts — اختبار شامل لمعالجة 10 فواتير تجريبية
 * 
 * يختبر:
 * 1. استخراج الفواتير العربية المتنوعة
 * 2. Pattern Learning (الحفظ والاسترجاع)
 * 3. AI Fallback (عند عدم وجود template)
 * 4. Verification Layer (فحص المنطق)
 * 5. Currency Normalization (تطبيع العملات)
 * 
 * التشغيل: bun run scripts/test-invoice-brain-10.ts
 */

import "dotenv/config";
import { extractInvoice, JsonFilePatternStore, mapBrainToOrder, buildCompanyContext } from "../src/lib/invoice-brain";
import { fingerprintText } from "../src/lib/invoice-brain/fingerprint";
import { verifyExtractedFields } from "../src/lib/invoice-brain/verifyExtraction";
import path from "path";
import fs from "fs";

// ─── 10 فواتير تجريبية متنوعة ─────────────────────────────────────────────

const TEST_INVOICES = [
  // #1: فاتورة كويتية قياسية (WhatsApp)
  {
    id: 1,
    name: "فاتورة كويتية - إلكترونيات",
    text: `📍 العنوان: الكويت - حولي - شارع ابن خلدون
📞 الهاتف: 50001234
👤 العميل: أحمد محمد

🛠️ الطلب:
٢ ماتور ١٦ دينار
٣ فيلتر ٤.٥ دينار
١ زيت ٢ دينار

💰 الإجمالي: ٢٦.٥ دينار`,
    expected: { name: "أحمد محمد", total: 26.5 },
  },

  // #2: فاتورة سعودية (نص عربي)
  {
    id: 2,
    name: "فاتورة سعودية - مطعم",
    text: `اسم العميل: خالد عبدالله
العنوان: الرياض - حي النزهة - شارع الملك فهد
هاتف: 0501234567

الطلب:
١ وجبة دجاج ٣٥ ريال
٢ مشروب غازي ٨ ريال
١ سلطة ١٢ ريال

الإجمالي: ٥٥ ريال
الضريبة: ٢.٧٥ ريال`,
    expected: { name: "خالد عبدالله", total: 55 },
  },

  // #3: فاتورة مصرية (أرقام إنجليزية)
  {
    id: 3,
    name: "فاتورة مصرية - ملابس",
    text: `العميل: محمود حسن
العنوان: القاهرة - مدينة نصر - شارع عباس العقاد
تليفون: 01098765432

الطلب:
2 تيشيرت 450 جنيه
1 بنطلون جينز 350 جنيه
1 حذاء رياضي 280 جنيه

الإجمالي: 1080 جنيه
الخصم: 50 جنيه`,
    expected: { name: "محمود حسن", total: 1030 },
  },

  // #4: فاتورة إماراتية (مختصرة)
  {
    id: 4,
    name: "فاتورة إماراتية - خدمات",
    text: `👤 سارة أحمد
📱 0551234567
📍 دبي - الجادريه

خدمة تصميم: 500 درهم
استضافة سنة: 300 درهم

المجموع: 800 درهم
ضريبة VAT 5%: 40 درهم`,
    expected: { name: "سارة أحمد", total: 840 },
  },

  // #5: فاتورة بحرينية (تنسيق مختلف)
  {
    id: 5,
    name: "فاتورة بحرينية - قطع غيار",
    text: `العميل: علي موسى
🔧 قطع غيار سيارات
📞 12345678

- فلتر زيت: 8 دينار
- زيت موتور: 12 دينار
- طقم فرامل: 25 دينار

الإجمالي: 45 دينار بحريني
التوصيل: 3 دينار`,
    expected: { name: "علي موسى", total: 48 },
  },

  // #6: فاتورة عمانية (QR Code style)
  {
    id: 6,
    name: "فاتورة عمانية - بقالة",
    text: `عميل: فاطمة العلي
عنوان: مسقط - الباطنة

المشتريات:
3 كيلو أرز 2.500 ريال عماني
2 كيلو سكر 1.200 ريال عماني
1 لبن كامل 0.800 ريال عماني

الكلي: 4.500 ريال عماني`,
    expected: { name: "فاطمة العلي", total: 4.5 },
  },

  // #7: فاتورة قطرية (English/Arabic mixed)
  {
    id: 7,
    name: "فاتورة قطرية - مقهى",
    text: `Customer: John Doe (جون دو)
Phone: 70123456
Location: Doha - West Bay

☕ Order:
3 Latte 45 QAR
2 Croissant 30 QAR
1 Cake slice 25 QAR

Total: 100 QAR
VAT (5%): 5 QAR`,
    expected: { name: "John Doe (جون دو)", total: 105 },
  },

  // #8: فاتورة ليبيا (تنسيق قديم)
  {
    id: 8,
    name: "فاتورة ليبية - مواد بناء",
    text: `اسم الزبون: عمر الفيتوري
هاتف: 0912345678
العنوان: طرابلس - طريق المطار

المواد:
10 اسمنت 200 دينار ليبي
5 حديد 150 دينار ليبي
2 رمل 40 دينار ليبي

المجموع الكلي: 390 دينار ليبي`,
    expected: { name: "عمر الفيتوري", total: 390 },
  },

  // #9: فاتورة مغربية (فرنسي/عربي)
  {
    id: 9,
    name: "فاتورة مغربية - مطعم",
    text: `Client: يوسف أمين
Tél: 0661234567
Adresse: Casablanca - Maârif

Tagine poulet: 120 MAD
Couscous: 80 MAD
Thé menthe (x2): 20 MAD

Total: 220 MAD
Service: 22 MAD`,
    expected: { name: "يوسف أمين", total: 242 },
  },

  // #10: فاتورة جزائرية (أرقام مفصصة)
  {
    id: 10,
    name: "فاتورة جزائرية - أدوية",
    text: `المریض: ناصر الدين
📞 0555123456
🏥 صيدلية النور

الأدویة:
١ مضاد حیوي ٤٥٠ دینار جزائري
١ مسكن ٢٠٠ دینار جزائري
١ فیتامین ١٥٠ دینار جزائري

المجموع: ٨٠٠ د.ج`,
    expected: { name: "ناصر الدين", total: 800 },
  },
];

// ─── Company Context للاختبار ──────────────────────────────────────────────

const TEST_COMPANY = {
  slug: "test-company-brain",
  currency: "KWD",
  country: "KW",
  defaultTaxRate: "15",
};

// ─── دالة الاختبار الرئيسية ─────────────────────────────────────────────────

interface TestResult {
  id: number;
  name: string;
  success: boolean;
  source: string;
  extracted?: Record<string, unknown>;
  verification?: {
    verified: boolean;
    confidence: number;
    issues: string[];
  };
  latencyMs: number;
  error?: string;
  fingerprint?: string;
}

async function runTests(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     🧪 اختبار Invoice Brain - 10 فواتير تجريبية          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // استخدام JsonFilePatternStore للاختبار بدون قاعدة بيانات
  const testDbPath = path.join(process.cwd(), "download", "test-brain-store.json");
  
  // التأكد من وجود مجلد download
  const downloadDir = path.dirname(testDbPath);
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  
  const store = new JsonFilePatternStore(testDbPath);
  console.log(`📁 استخدام JsonFilePatternStore: ${testDbPath}\n`);
  
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const testInvoice of TEST_INVOICES) {
    const startTime = Date.now();
    
    try {
      console.log(`┌─ 📋 [#${testInvoice.id}] ${testInvoice.name}`);
      console.log(`│   النص: ${testInvoice.text.slice(0, 50)}...`);
      
      // 1. حساب الـ fingerprint
      const fp = fingerprintText(testInvoice.text);
      console.log(`│   🔍 Fingerprint: ${fp}`);
      
      // 2. الاستخراج عبر invoice brain
      const result = await extractInvoice(testInvoice.text, store, {
        companySlug: TEST_COMPANY.slug,
      });
      
      const latencyMs = Date.now() - startTime;
      
      // 3. التحقق من النتيجة
      if (!result.data || result.source === "ai-error") {
        console.log(`│   ❌ فشل: ${result.error}`);
        results.push({
          id: testInvoice.id,
          name: testInvoice.name,
          success: false,
          source: result.source,
          latencyMs,
          error: result.error,
          fingerprint: fp,
        });
        failed++;
      } else {
        // 4. Verification layer
        const verification = verifyExtractedFields(result.data, testInvoice.text);
        
        // 5. Mapping إلى GarfiX order
        const ctx = buildCompanyContext(TEST_COMPANY);
        const mapped = mapBrainToOrder(result.data, ctx);
        
        console.log(`│   ✅ نجح (${result.source})`);
        console.log(`│      المستخرج:`, {
          name: result.data.name,
          price: result.data.price,
          total: result.data.total,
          tax: result.data.tax,
          discount: result.data.discount,
        });
        console.log(`│      Verification: ${(verification.confidence * 100).toFixed(0)}% confidence (${verification.verified ? '✅' : '⚠️'})`);
        if (verification.issues.length > 0) {
          console.log(`│      Issues:`, verification.issues);
        }
        console.log(`│      Mapped to Order: ${mapped.ok ? '✅' : '❌'} ${mapped.ok ? '' : mapped.reason}`);
        
        results.push({
          id: testInvoice.id,
          name: testInvoice.name,
          success: true,
          source: result.source,
          extracted: result.data as unknown as Record<string, unknown>,
          verification: {
            verified: verification.verified,
            confidence: verification.confidence,
            issues: verification.issues,
          },
          latencyMs,
          fingerprint: fp,
        });
        passed++;
      }
      
      console.log(`│   ⏱️  الوقت: ${latencyMs}ms`);
      console.log("└");
      
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`│   💥 خطأ غير متوقع: ${msg}`);
      console.log("└");
      
      results.push({
        id: testInvoice.id,
        name: testInvoice.name,
        success: false,
        source: "error",
        latencyMs,
        error: msg,
      });
      failed++;
    }
    
    console.log(""); // سطر فارغ بين الاختبارات
  }

  // ─── ملخص النتائج ────────────────────────────────────────────────────────
  
  console.log("\n" + "═".repeat(65));
  console.log("📊 ملخص نتائج الاختبار");
  console.log("═".repeat(65));
  
  console.log(`\n✅ الناجحة: ${passed}/10`);
  console.log(`❌ الفاشلة: ${failed}/10`);
  console.log(`📈 نسبة النجاح: ${((passed / 10) * 100).toFixed(0)}%\n`);

  // تفاصيل المصادر
  const sourceCounts: Record<string, number> = {};
  for (const r of results) {
    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
  }
  console.log("📂 توزيع المصادر:");
  for (const [source, count] of Object.entries(sourceCounts)) {
    console.log(`   • ${source}: ${count} فاتورة`);
  }

  // متوسط الثقة
  const avgConfidence = results
    .filter((r) => r.verification)
    .reduce((sum, r) => sum + (r.verification?.confidence ?? 0), 0) / (results.filter((r) => r.verification).length || 1);
  console.log(`\n🎯 متوسط ثقة Verification: ${(avgConfidence * 100).toFixed(1)}%`);

  // متوسط الوقت
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  console.log(`⏱️  متوسط وقت المعالجة: ${avgLatency.toFixed(0)}ms`);

  // الفواتير التي فشلت
  if (failed > 0) {
    console.log("\n⚠️  الفواتير التي فشلت:");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`   • [#${r.id}] ${r.name}: ${r.error || 'Unknown error'}`);
    }
  }

  // إحصائيات Templates
  try {
    const stats = await store.stats();
    console.log("\n📚 إحصائيات Pattern Store (JsonFile):");
    console.log(`   • عدد Templates: ${stats.totalTemplates}`);
    console.log(`   • إجمالي Hits: ${stats.totalHits}`);
    
    if (stats.totalTemplates > 0) {
      console.log("\n💾 Templates المحفوظة:");
      // قراءة الملف لعرض المحتوى
      try {
        const rawData = fs.readFileSync(testDbPath, "utf-8");
        const data = JSON.parse(rawData);
        for (const [fp, template] of Object.entries(data) as [string, any][]) {
          console.log(`   • ${fp.slice(0, 16)}... (${template.fields?.length || 0} fields, hits: ${template.sampleCount || 0})`);
        }
      } catch {
        console.log("   (تعذر قراءة تفاصيل Templates)");
      }
    }
  } catch (err) {
    console.log("\n⚠️  تعذر قراءة إحصائيات Pattern Store:", err instanceof Error ? err.message : String(err));
  }

  console.log("\n" + "═".repeat(65));
  console.log("🏁 انتهى الاختبار");
  console.log("═".repeat(65));

  // Exit code للـ CI/CD
  if (failed > 0) {
    process.exit(1);
  }
}

// ─── تشغيل الاختبار ────────────────────────────────────────────────────────

runTests().catch((err) => {
  console.error("💥 فشل تشغيل الاختبار:", err);
  process.exit(1);
});
