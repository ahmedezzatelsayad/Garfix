-- P0 LEARNING LOOP: حلقة تغذية راجعة حقيقية — بدونها النظام يتعلم ما نجح
-- فقط (pattern hit) ولا يعرف ما فشل. هذا الجدول يخزن تقييم البشر لكل رد.
CREATE TABLE IF NOT EXISTS "ai_feedback" (
    "id" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    -- ربط بالطلب الأصلي في AIRequestLog (إن وُجد) وللمحادثة
    "requestLogId" INTEGER,
    "conversationId" TEXT,
    "messageRole" TEXT NOT NULL DEFAULT 'assistant',
    "question" TEXT,
    "answer" TEXT,
    -- التقييم: صحيح/خطأ + التصحيح + السبب
    "rating" TEXT NOT NULL DEFAULT 'pending', -- up | down | pending
    "correctedAnswer" TEXT,
    "correctionReason" TEXT,
    "correctedBy" TEXT,
    -- أثر التعلم: هل دخل هذا التصحيح للنمط؟
    "learnedFrom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_feedback_companySlug_idx" ON "ai_feedback"("companySlug");
CREATE INDEX IF NOT EXISTS "ai_feedback_rating_idx" ON "ai_feedback"("rating");
