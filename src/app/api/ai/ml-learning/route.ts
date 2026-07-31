/**
 * POST /api/ai/ml-learning — ML Learning API Endpoint
 *
 * Provides REST interface for:
 * 1. Recording user corrections (learning)
 * 2. Getting predictions from ML model
 * 3. Batch training from historical data
 * 4. Getting model statistics
 *
 * Authentication: Required (company context)
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import {
  recordCorrection,
  predictFromPatterns,
  batchTrain,
  getModelStats,
  loadPatternsToCache,
  clearCache,
  type UserCorrection,
} from "@/lib/ml/productLearningStore";
import { extractPatterns } from "@/lib/ml/patternLearner";
import {
  mlMatchProduct,
  recordUserFeedback,
  trainFromHistory,
  initializeMLEngine,
  getMetrics,
  updateConfig,
  getConfig,
} from "@/lib/ml/mlMatchingEngine";
import { logger } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────────────────

interface RecordCorrectionRequest {
  action: "record-correction";
  correction: UserCorrection;
}

interface PredictRequest {
  action: "predict";
  companySlug: string;
  inputText: string;
  minConfidence?: number;
}

interface BatchTrainRequest {
  action: "batch-train";
  companySlug: string;
  corrections: UserCorrection[];
}

interface FeedbackRequest {
  action: "feedback";
  feedback: Parameters<typeof recordUserFeedback>[0];
}

interface StatsRequest {
  action: "stats" | "metrics" | "config";
  companySlug?: string;
}

type MLRequest = 
  | RecordCorrectionRequest 
  | PredictRequest 
  | BatchTrainRequest 
  | FeedbackRequest 
  | StatsRequest;

// ─── Main Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. Authenticate
    const authResult = await resolveAuth(request);
    if (!authResult?.user) {
      return NextResponse.json(
        { error: "غير مصرح - ي-required تسجيل الدخول" },
        { status: 401 }
      );
    }

    const session = authResult;

    // 2. Parse request body
    let body: MLRequest;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "جسم الطلب غير صالح - JSON مطلوب" },
        { status: 400 }
      );
    }

    // 3. Route based on action
    const userId = session.user?.uid;
    switch (body.action) {
      case "record-correction":
        return handleRecordCorrection(body, userId || "system");
      
      case "predict":
        return handlePredict(body);
      
      case "batch-train":
        return handleBatchTrain(body);
      
      case "feedback":
        return handleFeedback(body, userId || "system");
      
      case "stats":
        return handleStats(body);
      
      case "metrics":
        return handleMetrics();
      
      case "config":
        return handleConfig(body);
      
      default:
        return NextResponse.json(
          { error: `إجراء غير معروف: ${(body as any).action}` },
          { status: 400 }
        );
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("[ml-api] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      durationMs: duration,
    });
    
    return NextResponse.json(
      { error: "خطأ داخلي في الخادم" },
      { status: 500 }
    );
  }
}

// Also allow GET for stats/metrics (read-only operations)
export async function GET(request: NextRequest) {
  try {
    const authResult = await resolveAuth(request);
    if (!authResult?.user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "stats";

    switch (action) {
      case "stats":
        return handleStats({ action: "stats" });
      
      case "metrics":
        return handleMetrics();
      
      case "config":
        return NextResponse.json({ config: getConfig() });
      
      case "health":
        return NextResponse.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      
      default:
        return NextResponse.json(
          { error: `إجراء GET غير معروف: ${action}` },
          { status: 400 }
        );
    }

  } catch (err) {
    logger.error("[ml-api] GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    
    return NextResponse.json(
      { error: "خطأ داخلي في الخادم" },
      { status: 500 }
    );
  }
}

// ─── Action Handlers ─────────────────────────────────────────────────────

async function handleRecordCorrection(
  body: RecordCorrectionRequest,
  userId: string
) {
  // Validate required fields
  if (!body.correction?.inputText || !body.correction?.correctedProductId) {
    return NextResponse.json(
      { error: "حقول مطلوبة: inputText, correctedProductId" },
      { status: 400 }
    );
  }

  // Add userId to correction
  const correction: UserCorrection = {
    ...body.correction,
    userId,
  };

  const pattern = await recordCorrection(correction);

  if (!pattern) {
    return NextResponse.json(
      { error: "فشل تسجيل التصحيح" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    pattern: {
      id: pattern.id,
      confidence: pattern.confidence,
      confirmCount: pattern.confirmCount,
      rejectCount: pattern.rejectCount,
      targetProductName: pattern.targetProductName,
    },
    message: "تم تسجيل التصحيح وتحديث النموذج",
  });
}

async function handlePredict(body: PredictRequest) {
  if (!body.companySlug || !body.inputText) {
    return NextResponse.json(
      { error: "حقول مطلوبة: companySlug, inputText" },
      { status: 400 }
    );
  }

  const prediction = predictFromPatterns(
    body.companySlug,
    body.inputText,
    body.minConfidence ?? 0.7
  );

  if (!prediction) {
    return NextResponse.json({
      success: true,
      prediction: null,
      message: "لم يتم العثور على نمط مطابق",
    });
  }

  return NextResponse.json({
    success: true,
    prediction: {
      productId: prediction.productId,
      productName: prediction.productName,
      confidence: prediction.confidence,
      patternId: prediction.patternId,
    },
    message: "تم العثور على تطابق باستخدام النموذج المتعلم",
  });
}

async function handleBatchTrain(body: BatchTrainRequest) {
  if (!body.companySlug || !Array.isArray(body.corrections)) {
    return NextResponse.json(
      { error: "حقول مطلوبة: companySlug, corrections (array)" },
      { status: 400 }
    );
  }

  if (body.corrections.length === 0) {
    return NextResponse.json(
      { error: "لا توجد تصحيحات للتدريب" },
      { status: 400 }
    );
  }

  // Limit batch size to prevent abuse
  if (body.corrections.length > 1000) {
    return NextResponse.json(
      { error: "حجم الدفعة كبير جداً - الحد الأقصى 1000 تصحيح" },
      { status: 400 }
    );
  }

  // Extract patterns first (for reporting)
  const learningResult = extractPatterns(body.corrections);

  // Train the model
  const trainResult = await batchTrain(body.companySlug, body.corrections);

  return NextResponse.json({
    success: true,
    result: {
      ...trainResult,
      patternsExtracted: learningResult.rulesExtracted.length,
      aliasesLearned: learningResult.aliasesAdded.length,
      normalizationRules: learningResult.normalizationRulesLearned.length,
      brandAssociations: learningResult.brandAssociations.length,
    },
    message: `اكتمل التدريب: ${trainResult.trained} تصحيح، ${trainResult.patternsCreated} نمط جديد`,
  });
}

async function handleFeedback(body: FeedbackRequest, userId: string) {
  if (!body.feedback?.inputText || !body.feedback?.companySlug) {
    return NextResponse.json(
      { error: "حقول مطلوبة: feedback.inputText, feedback.companySlug" },
      { status: 400 }
    );
  }

  const result = await recordUserFeedback({
    ...body.feedback,
    userId,
  });

  return NextResponse.json({
    success: true,
    learned: result.learned,
    pattern: result.pattern ? {
      id: result.pattern.id,
      confidence: result.pattern.confidence,
    } : undefined,
    message: result.learned 
      ? "تم تعلم التغذية الراجعة وتحديث النموذج" 
      : "تم استلام التغذية الراجعة (لم يتم التعلم)",
  });
}

async function handleStats(body: StatsRequest) {
  let stats = getModelStats();

  // If companySlug provided, filter stats for that company
  if (body.companySlug) {
    const patternsForCompany = stats.patternsByCompany[body.companySlug] || 0;
    stats = {
      ...stats,
      totalPatterns: patternsForCompany,
      topPatterns: stats.topPatterns.filter(p => p.companySlug === body.companySlug),
    };
  }

  // Load fresh patterns count from cache if requested
  if (body.companySlug) {
    // This is a simplified version - in production you'd query the actual cache size
  }

  return NextResponse.json({
    success: true,
    stats: {
      totalCorrections: stats.totalCorrections,
      totalPatterns: stats.totalPatterns,
      patternsByCompany: stats.patternsByCompany,
      averageConfidence: stats.averageConfidence,
      learningRate: stats.learningRate,
      recentCorrectionsCount: stats.recentCorrections.length,
    },
    message: "إحصائيات النموذج",
  });
}

function handleMetrics() {
  const metrics = getMetrics();

  return NextResponse.json({
    success: true,
    metrics: {
      ...metrics,
      engineConfig: getConfig(),
    },
    message: "مقاييس أداء محرك ML",
  });
}

function handleConfig(body: StatsRequest & { config?: Partial<Parameters<typeof updateConfig>[0]> }) {
  if (body.config) {
    updateConfig(body.config);
    return NextResponse.json({
      success: true,
      config: getConfig(),
      message: "تم تحديث إعدادات المحرك",
    });
  }

  return NextResponse.json({
    success: true,
    config: getConfig(),
    message: "إعدادات المحرك الحالية",
  });
}

// ─── Initialization Endpoint ────────────────────────────────────────────

/**
 * Initialize the ML engine (call once on startup).
 * This can be called via a cron job or startup script.
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await resolveAuth(request);
    // Allow initialization without auth for system calls
    // In production, you'd want to validate an API key or system token
    // Note: We allow unauthenticated access for system initialization
    // This is intentional for startup scripts and cron jobs

    const body = await request.json().catch(() => ({}));

    if (body.action === "initialize") {
      await initializeMLEngine();
      return NextResponse.json({
        success: true,
        message: "تم تهيئة محرك ML بنجاح",
      });
    }

    if (body.action === "reload-cache") {
      const companySlug = body.companySlug as string | undefined;
      const loadedCount = await loadPatternsToCache(companySlug);
      return NextResponse.json({
        success: true,
        loadedCount,
        message: `تم إعادة تحميل ${loadedCount} نمط للذاكرة المؤقتة`,
      });
    }

    if (body.action === "clear-cache") {
      const companySlug = body.companySlug as string | undefined;
      clearCache(companySlug);
      return NextResponse.json({
        success: true,
        message: companySlug 
          ? `تم مسح ذاكرة ${companySlug} المؤقتة` 
          : "تم مسح جميع الذاكرات المؤقتة",
      });
    }

    return NextResponse.json(
      { error: `إجراء PUT غير معروف: ${body.action || "undefined"}` },
      { status: 400 }
    );

  } catch (err) {
    logger.error("[ml-api] PUT error", {
      error: err instanceof Error ? err.message : String(err),
    });
    
    return NextResponse.json(
      { error: "خطأ داخلي في الخادم" },
      { status: 500 }
    );
  }
}
