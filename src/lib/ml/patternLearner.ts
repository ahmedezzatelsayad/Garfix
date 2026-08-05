/**
 * patternLearner.ts — Advanced Pattern Learning from User Corrections
 *
 * يستخرج أنماط ذكية من تصحيحات المستخدم ويحولها لقواعد مطابقة.
 *
 * Learning Capabilities:
 * 1. **Alias Extraction**: استخراج أسماء بديلة من النصوص غير المطابقة
 * 2. **Normalization Rules**: تعلم قواعد التطبيع الخاصة بكل شركة
 * 3. **Brand-Product Associations**: ربط الماركات بالمنتجات
 * 4. **Price Range Patterns**: نطاقات الأسعار المتوقعة لكل منتج
 * 5. **Contextual Patterns**: أنماط سياقية (مثلاً: "فلتر زيت + تويوتا = فلتر زيت تويوتا")
 */

import { logger } from "../logger";
import { normalizeArabic } from "../productMatcher";
import { type UserCorrection, type LearnedPattern } from "./productLearningStore";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ExtractedRule {
  id: string;
  ruleType: "alias" | "normalization" | "brand-product" | "price-range" | "contextual";
  input: string;
  output: string;
  confidence: number;
  usageCount: number;
  lastUsedAt: Date;
  companySlug: string;
  description: string;
}

export interface NormalizationRule {
  pattern: RegExp;
  replacement: string;
  description: string;
  confidence: number;
  learnedFrom: string[];
}

export interface BrandProductAssociation {
  brand: string;
  productId: string;
  productName: string;
  confidence: number;
  expectedPriceRange?: { min: number; max: number };
}

export interface LearningResult {
  rulesExtracted: ExtractedRule[];
  aliasesAdded: string[];
  normalizationRulesLearned: NormalizationRule[];
  brandAssociations: BrandProductAssociation[];
  patternsUpdated: number;
}

// ─── Pattern Extraction Engine ───────────────────────────────────────────

/**
 * Extract learnable patterns from a batch of corrections.
 */
export function extractPatterns(corrections: UserCorrection[]): LearningResult {
  const result: LearningResult = {
    rulesExtracted: [],
    aliasesAdded: [],
    normalizationRulesLearned: [],
    brandAssociations: [],
    patternsUpdated: 0,
  };

  // Group corrections by company for context-aware learning
  const byCompany = groupBy(corrections, c => c.companySlug);

  for (const [companySlug, companyCorrections] of byCompany) {
    // 1. Extract alias patterns
    const aliasRules = extractAliasPatterns(companyCorrections, companySlug);
    result.rulesExtracted.push(...aliasRules.rules);
    result.aliasesAdded.push(...aliasRules.aliases);

    // 2. Learn normalization rules
    const normRules = learnNormalizationRules(companyCorrections, companySlug);
    result.normalizationRulesLearned.push(...normRules);

    // 3. Extract brand-product associations
    const brandAssocs = extractBrandAssociations(companyCorrections, companySlug);
    result.brandAssociations.push(...brandAssocs);

    // 4. Learn contextual patterns
    const contextualRules = learnContextualPatterns(companyCorrections, companySlug);
    result.rulesExtracted.push(...contextualRules);

    result.patternsUpdated += 
      aliasRules.rules.length + 
      normRules.length + 
      brandAssocs.length + 
      contextualRules.length;
  }

  logger.info("[pattern-learner] patterns extracted", {
    totalCorrections: corrections.length,
    rulesExtracted: result.rulesExtracted.length,
    aliasesAdded: result.aliasesAdded.length,
    normRules: result.normalizationRulesLearned.length,
    brandAssocs: result.brandAssociations.length,
  });

  return result;
}

// ─── Alias Pattern Extraction ────────────────────────────────────────────

interface AliasExtractionResult {
  rules: ExtractedRule[];
  aliases: string[];
}

function extractAliasPatterns(
  corrections: UserCorrection[],
  companySlug: string
): AliasExtractionResult {
  const result: AliasExtractionResult = { rules: [], aliases: [] };

  for (const correction of corrections) {
    if (!correction.correctedProductName) continue;

    const inputNormalized = normalizeArabic(correction.inputText).toLowerCase().trim();
    const productNormalized = normalizeArabic(correction.correctedProductName).toLowerCase().trim();

    // Skip if too similar (not a useful alias)
    if (similarityScore(inputNormalized, productNormalized) > 0.9) continue;

    // Check if this is a meaningful alias
    const aliasType = classifyAlias(inputNormalized, productNormalized);
    
    if (aliasType) {
      const rule: ExtractedRule = {
        id: `alias_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ruleType: "alias",
        input: inputNormalized,
        output: productNormalized,
        confidence: calculateAliasConfidence(aliasType, correction),
        usageCount: 1,
        lastUsedAt: new Date(),
        companySlug,
        description: generateAliasDescription(aliasType, correction.inputText, correction.correctedProductName),
      };

      result.rules.push(rule);
      result.aliases.push(inputNormalized);
    }
  }

  return result;
}

type AliasType = 
  | "abbreviation"     // اختصار: "فلتر زيت" → "فلتر زيت السيارة"
  | "transposition"    // تبديل كلمات: "زيت محرك" → "محرك زيت"
  | "misspelling"      // إملائي: "فيلتر" → "فلتر"
  | "brand-prefix"     // إضافة/إزالة ماركة: "تويوتا فلتر" → "فلتر"
  | "description-add"  // إضافة وصف: "فلتر" → "فلتر زيت عالي الجودة"
  | "synonym"          // مرادف: "منقي" → "فلتر"
  | null;

function classifyAlias(input: string, product: string): AliasType | null {
  // Check for abbreviation (input is shorter)
  if (input.length < product.length * 0.6) {
    if (product.includes(input)) return "abbreviation";
  }

  // Check for transposition (same words, different order)
  const inputWords = input.split(" ").sort();
  const productWords = product.split(" ").sort();
  if (JSON.stringify(inputWords) === JSON.stringify(productWords) && input !== product) {
    return "transposition";
  }

  // Check for misspelling (similar length, high edit distance)
  if (Math.abs(input.length - product.length) <= 3) {
    const sim = similarityScore(input, product);
    if (sim >= 0.7 && sim < 0.95) return "misspelling";
  }

  // Check for brand prefix/suffix
  const brands = ["تويوتا", "نيسان", "هيونداي", "كيا", "مرسيدس", "بي ام دبليو", "بوش", "دينيسو", "فال"];
  for (const brand of brands) {
    const brandNorm = normalizeArabic(brand);
    if (input.includes(brandNorm) && !product.includes(brandNorm)) return "brand-prefix";
    if (product.includes(brandNorm) && !input.includes(brandNorm)) return "brand-prefix";
  }

  // Check for description addition
  if (product.includes(input) && product.length > input.length * 1.3) {
    return "description-add";
  }

  // If none of the above but reasonably similar, might be synonym
  const sim = similarityScore(input, product);
  if (sim >= 0.5 && sim < 0.9) return "synonym";

  return null;
}

function calculateAliasConfidence(aliasType: AliasType, correction: UserCorrection): number {
  // Type guard to ensure aliasType is not null
  if (!aliasType) return 0.7;
  
  const baseConfidence: Record<string, number> = {
    abbreviation: 0.85,
    transposition: 0.90,
    misspelling: 0.75,
    "brand-prefix": 0.80,
    "description-add": 0.70,
    synonym: 0.65,
  };

  let conf = (baseConfidence[aliasType as string] as number) || 0.7;

  // Boost based on correction type
  switch (correction.correctionType) {
    case "confirm":
      conf *= 1.1;
      break;
    case "override":
      conf *= 0.9; // Slightly less confident
      break;
  }

  return Math.min(conf, 0.98);
}

function generateAliasDescription(
  aliasType: AliasType | null, 
  input: string, 
  product: string
): string {
  if (!aliasType) return `اسم بديل: "${input}" → "${product}"`;
  
  const descriptions: Record<string, string> = {
    abbreviation: `اختصار: "${input}" → "${product}"`,
    transposition: `تبديل كلمات: "${input}" → "${product}"`,
    misspelling: `تصحيح إملائي: "${input}" → "${product}"`,
    "brand-prefix": `تعديل الماركة: "${input}" → "${product}"`,
    "description-add": `إضافة وصف: "${input}" → "${product}"`,
    synonym: `مرادف: "${input}" → "${product}"`,
  };

  return (descriptions[aliasType as string] as string) || `اسم بديل: "${input}" → "${product}"`;
}

// ─── Normalization Rule Learning ─────────────────────────────────────────

function learnNormalizationRules(
  corrections: UserCorrection[],
  companySlug: string
): NormalizationRule[] {
  const rules: NormalizationRule[] = [];
  const patternMap = new Map<string, { replacements: Map<string, number[]>; examples: string[] }>();

  for (const correction of corrections) {
    const differences = findDifferences(correction.inputText, correction.correctedProductName);
    
    for (const diff of differences) {
      const key = `${diff.type}:${diff.pattern}`;
      
      if (!patternMap.has(key)) {
        patternMap.set(key, { replacements: new Map(), examples: [] });
      }
      
      const entry = patternMap.get(key)!;
      const replacementKey = diff.replacement;
      
      if (!entry.replacements.has(replacementKey)) {
        entry.replacements.set(replacementKey, []);
      }
      entry.replacements.get(replacementKey)!.push(diff.confidence);
      entry.examples.push(`${correction.inputText} → ${correction.correctedProductName}`);
    }
  }

  // Convert frequent patterns to rules
  for (const [key, data] of patternMap.entries()) {
    for (const [replacement, confidences] of data.replacements.entries()) {
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      
      // Only create rule if we've seen it multiple times with good confidence
      if (confidences.length >= 2 && avgConfidence >= 0.7) {
        const [type, pattern] = key.split(":");
        
        try {
          const rule: NormalizationRule = {
            pattern: new RegExp(pattern, "gi"),
            replacement,
            description: `قاعدة ${type}: ${pattern} → ${replacement} (${confidences.length} مرات)`,
            confidence: avgConfidence,
            learnedFrom: data.examples.slice(0, 5), // Keep top 5 examples
          };
          
          rules.push(rule);
        } catch (e) {
          // Invalid regex - skip this pattern
          logger.warn("[pattern-learner] invalid regex pattern", { pattern });
        }
      }
    }
  }

  return rules;
}

interface Difference {
  type: "char-substitution" | "char-insertion" | "char-deletion" | "word-reorder";
  pattern: string;
  replacement: string;
  confidence: number;
}

function findDifferences(input: string, corrected: string): Difference[] {
  const differences: Difference[] = [];
  
  // Simple character-level difference detection
  const inputNorm = normalizeArabic(input).toLowerCase();
  const correctedNorm = normalizeArabic(corrected).toLowerCase();

  // Find character substitutions common in Arabic text
  const arabicSubstitutions: [string, string, string][] = [
    ["[أإآٱ]", "ا", "alef-variants"],
    ["[ةه]", "ه", "taa-marbuta"],
    ["[ىي]", "ي", "alef-maqsur"],
    ["[ؤو]", "و", "waw-hamza"],
  ];

  for (const [pattern, replacement, type] of arabicSubstitutions) {
    const regex = new RegExp(pattern, "g");
    if (regex.test(inputNorm) !== regex.test(correctedNorm)) {
      differences.push({
        type: "char-substitution",
        pattern,
        replacement,
        confidence: 0.85,
      });
    }
  }

  // Find word-level differences
  const inputWords = new Set(inputNorm.split(/\s+/));
  const correctedWords = new Set(correctedNorm.split(/\s+/));
  
  const onlyInInput = [...inputWords].filter(w => !correctedWords.has(w) && w.length > 1);
  const onlyInCorrected = [...correctedWords].filter(w => !inputWords.has(w) && w.length > 1);

  if (onlyInInput.length === 1 && onlyInCorrected.length === 1) {
    differences.push({
      type: "word-reorder",
      pattern: onlyInInput[0],
      replacement: onlyInCorrected[0],
      confidence: 0.8,
    });
  }

  return differences;
}

// ─── Brand-Product Association Extraction ─────────────────────────────────

function extractBrandAssociations(
  corrections: UserCorrection[],
  companySlug: string
): BrandProductAssociation[] {
  const associations: BrandProductAssociation[] = [];
  const brandProductMap = new Map<string, Map<string, {
    productId: string;
    productName: string;
    prices: number[];
    count: number;
  }>>();

  const brands = [
    "تويوتا", "نيسان", "هيونداي", "كيا", "مرسيدس", "بي ام دبليو",
    "بوش", "دينيسو", "فال", "ngk", "acdelco", "mobil", "castrol"
  ];

  for (const correction of corrections) {
    // Extract brands from both input and corrected product name
    const inputBrands = extractBrandsFromText(correction.inputText, brands);
    const productBrands = extractBrandsFromText(correction.correctedProductName, brands);

    // Use the brand that appears in either (prefer product brand)
    const detectedBrands = productBrands.length > 0 ? productBrands : inputBrands;

    for (const brand of detectedBrands) {
      if (!brandProductMap.has(brand)) {
        brandProductMap.set(brand, new Map());
      }

      const productMap = brandProductMap.get(brand)!;
      const key = correction.correctedProductId;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: correction.correctedProductId,
          productName: correction.correctedProductName,
          prices: [],
          count: 0,
        });
      }

      const entry = productMap.get(key)!;
      entry.count++;
      
      // Extract price if available (from original suggestion or elsewhere)
      if (correction.originalSuggestion) {
        // Price would need to be passed separately - placeholder for now
      }
    }
  }

  // Convert to associations with confidence scores
  for (const [brand, products] of brandProductMap.entries()) {
    for (const [_, data] of products.entries()) {
      if (data.count >= 2) { // Only include associations seen multiple times
        associations.push({
          brand,
          productId: data.productId,
          productName: data.productName,
          confidence: Math.min(0.5 + (data.count * 0.1), 0.95),
          expectedPriceRange: data.prices.length > 2 ? {
            min: Math.min(...data.prices),
            max: Math.max(...data.prices),
          } : undefined,
        });
      }
    }
  }

  return associations;
}

function extractBrandsFromText(text: string, knownBrands: string[]): string[] {
  const found: string[] = [];
  const normalized = normalizeArabic(text).toLowerCase();

  for (const brand of knownBrands) {
    const brandNorm = normalizeArabic(brand).toLowerCase();
    if (normalized.includes(brandNorm)) {
      found.push(brandNorm);
    }
  }

  return found;
}

// ─── Contextual Pattern Learning ─────────────────────────────────────────

function learnContextualPatterns(
  corrections: UserCorrection[],
  companySlug: string
): ExtractedRule[] {
  const rules: ExtractedRule[] = [];

  // Look for patterns like:
  // - "X + brand" → specific product variant
  // - "X for Y" → X when Y is present
  
  const contextPatterns = [
    { pattern: /(.+?)\s+(?:لـ|لـ|for)\s+(.+)$/i, description: "منتج لسيارة/جهاز" },
    { pattern: /(.+?)\s+(تويوتا|نيسان|هيونداي|كيا|مرسيدس)$/i, description: "منتج + ماركة" },
    { pattern: /^(?:original|اصلي|جديد)\s+(.+)$/i, description: "صفة + منتج" },
  ];

  for (const correction of corrections) {
    const input = correction.inputText.toLowerCase().trim();
    
    for (const ctxPattern of contextPatterns) {
      const match = input.match(ctxPattern.pattern);
      if (match) {
        const rule: ExtractedRule = {
          id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ruleType: "contextual",
          input: input,
          output: correction.correctedProductName,
          confidence: 0.75,
          usageCount: 1,
          lastUsedAt: new Date(),
          companySlug,
          description: `${ctxPattern.description}: "${input}" → "${correction.correctedProductName}"`,
        };
        
        rules.push(rule);
        break; // One rule per correction is enough
      }
    }
  }

  return rules;
}

// ─── Utility Functions ───────────────────────────────────────────────────

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  
  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return 1 - matrix[a.length][b.length] / maxLen;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  
  return groups;
}

// ─── Export Learning Functions ───────────────────────────────────────────

export {
  extractAliasPatterns,
  learnNormalizationRules,
  extractBrandAssociations,
  learnContextualPatterns,
  classifyAlias,
  similarityScore,
};

const patternLearner = {
  extractPatterns,
  extractAliasPatterns,
  learnNormalizationRules,
  extractBrandAssociations,
  learnContextualPatterns,
};

export default patternLearner;
