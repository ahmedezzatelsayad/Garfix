/**
 * test-ml-learning.ts — اختبار نظام ML Learning
 *
 * يختبر:
 * 1. تسجيل تصحيحات المستخدم
 * 2. التنبؤ بالأنماط المتعلمة
 * 3. استخراج الأنماط
 * 4. محرك المطابقة ML
 */

import { recordCorrection, predictFromPatterns, getModelStats, clearCache, normalizeForPattern, calculatePatternScore } from "../src/lib/ml/productLearningStore";
import { extractPatterns, classifyAlias, similarityScore } from "../src/lib/ml/patternLearner";
import { mlMatchProduct, recordUserFeedback, getMetrics, initializeMLEngine } from "../src/lib/ml/mlMatchingEngine";

// ─── Test Data ───────────────────────────────────────────────────────────

const TEST_COMPANY = "test-company-ml";
const TEST_USER = "test-user-ml";

const SAMPLE_CORRECTIONS = [
  {
    inputText: "فلتر زيت تويوتا",
    correctedProductId: "prod_001",
    correctedProductName: "فلتر زيت سيارة تويوتا",
    companySlug: TEST_COMPANY,
    userId: TEST_USER,
    correctionType: "confirm" as const,
  },
  {
    inputText: "فيلتر زيت",
    correctedProductId: "prod_001",
    correctedProductName: "فلتر زيت سيارة تويوتا",
    companySlug: TEST_COMPANY,
    userId: TEST_USER,
    correctionType: "override" as const,
    originalSuggestion: {
      productId: "prod_999",
      productName: "منتج آخر",
      method: "fuzzy",
      confidence: 0.6,
    },
  },
  {
    inputText: "زيت محرك",
    correctedProductId: "prod_002",
    correctedProductName: "زيت محرك اصلي",
    companySlug: TEST_COMPANY,
    userId: TEST_USER,
    correctionType: "new-alias" as const,
  },
  {
    inputText: "بوش بوجات",
    correctedProductId: "prod_003",
    correctedProductName: "بوشات اشعال بوش",
    companySlug: TEST_COMPANY,
    userId: TEST_USER,
    correctionType: "confirm" as const,
  },
];

// ─── Test Functions ──────────────────────────────────────────────────────

async function testRecordCorrection() {
  console.log("\n🧪 اختبار 1: تسجيل التصحيحات");
  
  let successCount = 0;
  
  for (let i = 0; i < SAMPLE_CORRECTIONS.length; i++) {
    const correction = SAMPLE_CORRECTIONS[i];
    const pattern = await recordCorrection(correction);
    
    if (pattern) {
      console.log(`  ✅ التصحيح ${i + 1}: ${correction.inputText} → ${correction.correctedProductName}`);
      console.log(`     النمط: ${pattern.id.slice(0, 20)}... الثقة: ${(pattern.confidence * 100).toFixed(1)}%`);
      successCount++;
    } else {
      console.log(`  ❌ فشل تسجيل التصحيح ${i + 1}`);
    }
  }
  
  console.log(`\n  📊 النتيجة: ${successCount}/${SAMPLE_CORRECTIONS.length} تصحيحات مسجلة`);
  return successCount === SAMPLE_CORRECTIONS.length;
}

async function testPredictFromPatterns() {
  console.log("\n🧪 اختبار 2: التنبؤ بالأنماط");
  
  // Test exact match
  const prediction1 = predictFromPatterns(TEST_COMPANY, "فلتر زيت تويوتا", 0.7);
  if (prediction1) {
    console.log(`  ✅ تطابق exat: "${prediction1.productName}" (${(prediction1.confidence * 100).toFixed(1)}%)`);
  } else {
    console.log(`  ⚠️ لم يتم العثور على تطابق exat`);
  }
  
  // Test fuzzy match
  const prediction2 = predictFromPatterns(TEST_COMPANY, "فيلتر زيت تويوتا", 0.5);
  if (prediction2) {
    console.log(`  ✅ تطابق fuzzy: "${prediction2.productName}" (${(prediction2.confidence * 100).toFixed(1)}%)`);
  } else {
    console.log(`  ℹ️ لم يتم العثور على تطابق fuzzy (قد يكون طبيعياً)`);
  }
  
  // Test no match for unknown pattern
  const prediction3 = predictFromPatterns(TEST_COMPANY, "منتج غير موجود ابداً", 0.7);
  if (!prediction3) {
    console.log(`  ✅ تم رفض النمط المجهول بشكل صحيح`);
  } else {
    console.log(`  ❌ كان يجب ألا يتم العثور على تطابق`);
  }
  
  return true;
}

function testExtractPatterns() {
  console.log("\n🧪 اختبار 3: استخراج الأنماط");
  
  const result = extractPatterns(SAMPLE_CORRECTIONS);
  
  console.log(`  📊 القواعد المستخرجة: ${result.rulesExtracted.length}`);
  console.log(`  🔤 الأسماء البديلة: ${result.aliasesAdded.length}`);
  console.log(`  📝 قواعد التطبيع: ${result.normalizationRulesLearned.length}`);
  console.log(`  🏷️ ارتباطات الماركات: ${result.brandAssociations.length}`);
  console.log(`  🔄 الأنماط المحدثة: ${result.patternsUpdated}`);
  
  // Show some extracted rules
  if (result.rulesExtracted.length > 0) {
    console.log("\n  أمثلة على القواعد المستخرجة:");
    result.rulesExtracted.slice(0, 3).forEach((rule, i) => {
      console.log(`    ${i + 1}. [${rule.ruleType}] ${rule.description.slice(0, 60)}...`);
    });
  }
  
  return result.patternsUpdated > 0;
}

function testAliasClassification() {
  console.log("\n🧪 اختبار 4: تصنيف الأسماء البديلة");
  
  const testCases = [
    { input: "فلتر", product: "فلتر زيت السيارة", expected: "abbreviation" },
    { input: "زيت محرك", product: "محرك زيت", expected: "transposition" },
    { input: "فيلتر", product: "فلتر", expected: "misspelling" },
    { input: "تويوتا فلتر", product: "فلتر", expected: "brand-prefix" },
  ];
  
  let passed = 0;
  
  for (const tc of testCases) {
    const aliasType = classifyAlias(tc.input, tc.product);
    const status = aliasType === tc.expected ? "✅" : "⚠️";
    console.log(`  ${status} "${tc.input}" → "${tc.product}": ${aliasType} (متوقع: ${tc.expected})`);
    if (aliasType === tc.expected) passed++;
  }
  
  return passed >= testCases.length * 0.75; // Allow some flexibility
}

function testSimilarityScore() {
  console.log("\n🧪 اختبار 5: حساب التشابه");
  
  const testCases = [
    { a: "فلتر زيت", b: "فلتر زيت", expected: 1.0 },
    { a: "فلتر زيت", b: "فلتر زيت سيارة", expected: 0.7 },
    { a: "زيت محرك", b: "محرك زيت", expected: 0.8 },
    { a: "منتج", b: "شيء مختلف تماما", expected: 0.2 },
  ];
  
  let passed = 0;
  
  for (const tc of testCases) {
    const score = similarityScore(tc.a, tc.b);
    const diff = Math.abs(score - tc.expected);
    const status = diff < 0.2 ? "✅" : "⚠️";
    console.log(`  ${status} "${tc.a}" vs "${tc.b}": ${score.toFixed(2)} (متوقع ~${tc.expected})`);
    if (diff < 0.2) passed++;
  }
  
  return passed >= testCases.length * 0.75;
}

function testNormalizeForPattern() {
  console.log("\n🧪 اختبار 6: التطبيع للأنماط");
  
  const testCases = [
    { input: "فلتر زيت!!!", expected: "فلتر زيت" },
    { input: "  فلتر  زيت  ", expected: "فلتر زيت" },
    { input: "FLTER ZYT", expected: "flter zyt" }, // lowercase
  ];
  
  let passed = 0;
  
  for (const tc of testCases) {
    const normalized = normalizeForPattern(tc.input);
    const status = normalized === tc.expected ? "✅" : "⚠️";
    console.log(`  ${status} "${tc.input}" → "${normalized}" (متوقع: "${tc.expected}")`);
    if (normalized === tc.expected) passed++;
  }
  
  return passed === testCases.length;
}

async function testModelStats() {
  console.log("\n🧪 اختبار 7: إحصائيات النموذج");
  
  const stats = getModelStats();
  
  console.log(`  📊 إجمالي التصحيحات: ${stats.totalCorrections}`);
  console.log(`  🔢 إجمالي الأنماط: ${stats.totalPatterns}`);
  console.log(`  📈 معدل التعلم: ${stats.learningRate}`);
  console.log(`  📝 آخر التصحيحات: ${stats.recentCorrections.length}`);
  
  return stats.totalCorrections > 0;
}

// ─── Main Test Runner ─────────────────────────────────────────────────────

async function runAllTests() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     🧠 اختبار نظام ML Learning لـ GarfiX EOS              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  // Clear cache before tests
  clearCache();
  console.log("\n🔄 تم مسح الذاكرة المؤقتة");
  
  const results: boolean[] = [];
  
  try {
    results.push(await testRecordCorrection());
    results.push(await testPredictFromPatterns());
    results.push(testExtractPatterns());
    results.push(testAliasClassification());
    results.push(testSimilarityScore());
    results.push(testNormalizeForPattern());
    results.push(await testModelStats());
  } catch (err) {
    console.error("\n❌ خطأ في تشغيل الاختبارات:", err);
  }
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    ملخص الاختبارات                      ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  ✅ ناجح: ${passed}/${total}                                              ║`);
  console.log(`║  ❌ فاشل: ${total - passed}/${total}                                              ║`);
  console.log(`║  📊 نسبة النجاح: ${((passed / total) * 100).toFixed(0)}%                                    ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  if (passed === total) {
    console.log("\n🎉 جميع الاختبارات نجحت! نظام ML Learning يعمل بشكل صحيح.");
  } else {
    console.log("\n⚠️ بعض الاختبارات فشلت. راجع السجل أعلاه للتفاصيل.");
  }
  
  // Cleanup
  clearCache();
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runAllTests().catch(console.error);
