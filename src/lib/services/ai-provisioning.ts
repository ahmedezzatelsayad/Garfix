/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 - AI Auto-Provisioning System
 * 
 * نظام توفير تلقائي لإعدادات AI عند تسجيل شركة جديدة
 * 
 * Features:
 * - Auto-create AI config when company registers
 * - Default provider setup with platform key
 * - Welcome message generation
 * - Usage quota initialization
 * - Notification to founder about AI setup
 * 
 * Integration Points:
 * - /api/auth/register → After successful registration
 * - /api/saas/companies → After company creation
 * - Platform admin can set default API key for new companies
 * ═════════════════════════════════════════════════════════════
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptSecret } from '@/lib/cryptoVault';

// ── Types ───────────────────────────────────────────────────

interface ProvisioningOptions {
  /** Company ID */
  companyId: string;
  /** Company slug */
  companySlug: string;
  /** Founder user ID */
  founderId: string;
  /** Founder email */
  founderEmail: string;
  /** Company name */
  companyName: string;
  
  // Optional overrides
  /** Custom default API key (uses platform default if not provided) */
  defaultApiKey?: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Monthly token quota */
  monthlyTokenQuota?: number;
}

interface ProvisioningResult {
  success: boolean;
  configId?: string;
  message: string;
  welcomeMessage?: string;
  setupUrl?: string;
}

// ── Default Configuration ───────────────────────────────────

const DEFAULT_AI_CONFIG = {
  provider: 'google-gemini',
  model: 'gemini-2.0-flash',
  maxTokens: 4096,
  temperature: 0.7,
  enabled: true,
  rateLimitRpm: 60,
  monthlyTokenQuota: 500000, // Free tier: 500K tokens/month
};

const DEFAULT_SYSTEM_PROMPTS = {
  ar: `أنت مساعد ذكي متخصص في منصة GarfiX EOS لنظام المحاسبة وإدارة الأعمال.

مهامك:
- الإجابة على أسئلة المستخدمين باللغة العربية
- مساعدة في تحليل البيانات المالية
- شرح ميزات النظام
- تقديم نصائح لتحسين الأعمال

النبرة:
- كن ودوداً ومحترفاً
- استخدم اللغة العربية الفصحى أو العامية حسب سياق المستخدم
- إذا لم تكن متأكداً، اطلب توضيحاً
- لا تعطي معلومات حساسة عن حسابات المستخدمين`,

  en: `You are an intelligent assistant specialized in the GarfiX EOS platform for accounting and business management.

Your tasks:
- Answer user questions in their preferred language
- Help analyze financial data
- Explain system features
- Provide business improvement tips

Tone:
- Be professional and friendly
- If unsure, ask for clarification
- Never share sensitive account information`,
};

// ── Main Provisioning Function ─────────────────────────────

/**
 * Create AI configuration for a newly registered company
 * Called automatically after company registration
 */
export async function provisionAIForNewCompany(
  options: ProvisioningOptions
): Promise<ProvisioningResult> {
  const {
    companyId,
    companySlug,
    founderId,
    founderEmail,
    companyName,
    defaultApiKey,
    systemPrompt,
    monthlyTokenQuota,
  } = options;
  
  try {
    logger.info(`Provisioning AI config for company: ${companyName} (${companyId})`);
    
    // Check if config already exists
    const existingConfig = await db.companyAIConfig.findUnique({
      where: { companyId },
    });
    
    if (existingConfig) {
      logger.info(`AI config already exists for company ${companyId}, skipping`);
      return {
        success: true,
        configId: existingConfig.id,
        message: 'AI configuration already exists',
      };
    }
    
    // Get platform default API key if not provided
    let apiKey = defaultApiKey;
    
    if (!apiKey) {
      try {
        // Try to get from platform settings
        const platformSetting = await db.platformSetting.findUnique({
          where: { key: 'ai_default_api_key' },
        });
        
        if (platformSetting?.value) {
          apiKey = platformSetting.value;
          logger.info('Using platform default API key');
        }
      } catch (error) {
        logger.warn('Could not fetch platform default API key', { error });
      }
    }
    
    // Encrypt the API key if present
    let encryptedKey = '';
    if (apiKey) {
      try {
        encryptedKey = await encryptSecret(apiKey);
      } catch (error) {
        logger.error('Failed to encrypt API key', { error });
        encryptedKey = apiKey; // Fallback (should not happen)
      }
    }
    
    // Determine system prompt language based on context
    const isArabicContext = /[\u0600-\u06FF]/.test(companyName);
    const defaultPrompt = isArabicContext 
      ? DEFAULT_SYSTEM_PROMPTS.ar 
      : DEFAULT_SYSTEM_PROMPTS.en;
    
    // Create the AI configuration
    const config = await db.companyAIConfig.create({
      data: {
        companyId,
        primaryProvider: JSON.stringify({
          ...DEFAULT_AI_CONFIG,
          apiKey: encryptedKey,
          monthlyTokenQuota: monthlyTokenQuota || DEFAULT_AI_CONFIG.monthlyTokenQuota,
        }),
        fallbackProvider: null,
        systemPrompt: systemPrompt || defaultPrompt,
        enableChat: true,
        enableSmartParse: true,
        enableInvoiceExtraction: true,
        enableMemory: true,
        memoryRetentionDays: 30,
        costOptimization: 'balanced',
        notifyHighUsage: true,
        usageNotificationThreshold: 80,
        tokensUsedThisMonth: 0,
        requestsThisMonth: 0,
        lastResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    
    logger.info(`✅ AI config created for company ${companyId}: ${config.id}`);
    
    // Generate personalized welcome message
    const welcomeMessage = generateWelcomeMessage(companyName, isArabicContext);
    
    // Log the provisioning event
    await logProvisioningEvent({
      companyId,
      companyName,
      founderId,
      founderEmail,
      configId: config.id,
      hasApiKey: !!apiKey,
    });
    
    return {
      success: true,
      configId: config.id,
      message: 'AI configuration provisioned successfully',
      welcomeMessage,
      setupUrl: `/founder-panel/ai-settings?company=${companySlug}`,
    };
    
  } catch (error: any) {
    logger.error(`❌ Failed to provision AI for company ${companyId}`, {
      error: error.message,
      stack: error.stack,
    });
    
    return {
      success: false,
      message: `Failed to provision AI: ${error.message}`,
    };
  }
}

/**
 * Generate personalized welcome message for new company
 */
function generateWelcomeMessage(
  companyName: string,
  isArabic: boolean
): string {
  if (isArabic) {
    return `🎉 مرحباً بك في منصة GarfiX EOS!

تم تفعيل ميزات الذكاء الاصطناعي لشركة **${companyName}**.

**ما يمكنك فعله الآن:**
1. ⚙️ **إعداد مفتاح API الخاص** - اذهب إلى إعدادات AI وأضف مفتاح Google Gemini الخاص بك
2. 💬 **تجربة المحادثة الذكية** - اسأل أي سؤال عن محاسبتك أو أعمالك
3. 🧾 **استخراج الفواتير الذكي** - ارفع فاتورة وسيقوم AI باستخراج البيانات تلقائياً

**ملاحظة:** لديك ${DEFAULT_AI_CONFIG.monthlyTokenQuota.toLocaleString()} توكن مجانية كهدية ترحيب! 🎁

للمساعدة، تواصل مع فريق الدعم: support@garfix.com`;
  }
  
  return `🎉 Welcome to GarfiX EOS Platform!

AI features have been activated for **${companyName}**.

**What you can do now:**
1. ⚙️ **Set up your API Key** - Go to AI Settings and add your Google Gemini API key
2. 💬 **Try Smart Chat** - Ask any question about your accounting or business
3. 🧾 **Smart Invoice Extraction** - Upload invoices and AI will extract data automatically

**Note:** You have ${DEFAULT_AI_CONFIG.monthlyTokenQuota.toLocaleString()} free tokens as a welcome gift! 🎁

For help, contact our support team: support@garfix.com`;
}

/**
 * Log provisioning event for analytics
 */
async function logProvisioningEvent(event: {
  companyId: string;
  companyName: string;
  founderId: string;
  founderEmail: string;
  configId: string;
  hasApiKey: boolean;
}): Promise<void> {
  try {
    // Try to use audit logging if available
    const { logAudit } = await import('@/lib/audit').catch(() => ({ logAudit: async () => {} }));
    
    await logAudit({
      userEmail: event.founderEmail,
      userUid: event.founderId,
      action: 'ai_auto_provisioned',
      entity: 'company_ai_config',
      details: {
        companyId: event.companyId,
        companyName: event.companyName,
        configId: event.configId,
        hasApiKey: event.hasApiKey,
      },
    });
  } catch (error) {
    // Audit logging is best-effort
    logger.warn('Failed to log provisioning event', { error });
  }
}

// ── Batch Provisioning (for existing companies) ───────────

/**
 * Provision AI for all companies that don't have it yet
 * Useful for migration or bulk operations
 */
export async function batchProvisionMissingCompanies(
  options?: {
    dryRun?: boolean; // If true, don't actually create, just report
    limit?: number; // Max companies to process
  }
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ companyId: string; error: string }>;
}> {
  const { dryRun = false, limit = 100 } = options || {};
  
  const result = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [] as Array<{ companyId: string; error: string }>,
  };
  
  try {
    // Find companies without AI config
    const companiesWithoutConfig = await db.$queryRaw`
      SELECT c.id, c.slug, c.name, cm."userId", u.email
      FROM "Company" c
      LEFT JOIN "CompanyMember" cm ON cm."companyId" = c.id AND cm.role = 'founder'
      LEFT JOIN "User" u ON u.id = cm."userId"
      WHERE NOT EXISTS (
        SELECT 1 FROM "CompanyAIConfig" cac WHERE cac."companyId" = c.id
      )
      LIMIT ${limit}
    ` as Array<{
      id: string;
      slug: string;
      name: string;
      userId: string;
      email: string;
    }>;
    
    result.processed = companiesWithoutConfig.length;
    
    for (const company of companiesWithoutConfig) {
      if (dryRun) {
        result.skipped++;
        continue;
      }
      
      const provisionResult = await provisionAIForNewCompany({
        companyId: company.id,
        companySlug: company.slug,
        founderId: company.userId,
        founderEmail: company.email,
        companyName: company.name,
      });
      
      if (provisionResult.success) {
        result.succeeded++;
      } else {
        result.failed++;
        result.errors.push({
          companyId: company.id,
          error: provisionResult.message,
        });
      }
      
      // Small delay between provisions to avoid overwhelming DB
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logger.info(`Batch AI provisioning complete`, result);
    
  } catch (error: any) {
    logger.error('Batch provisioning failed', { error });
  }
  
  return result;
}

// ── Platform Default Key Management ───────────────────────

/**
 * Set platform-wide default API key for new companies
 * Only accessible by platform admin
 */
export async function setPlatformDefaultAPIKey(
  apiKey: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Verify admin role (simplified - should use proper permission check)
    const adminUser = await db.user.findUnique({
      where: { id: adminUserId },
    });
    
    if (!adminUser || adminUser.role !== 'platform_admin') {
      return { success: false, message: 'Unauthorized: Platform admin access required' };
    }
    
    // Encrypt and store
    const encryptedKey = await encryptSecret(apiKey);
    
    await db.platformSetting.upsert({
      where: { key: 'ai_default_api_key' },
      update: { value: encryptedKey, updatedAt: new Date() },
      create: {
        key: 'ai_default_api_key',
        value: encryptedKey,
        description: 'Default Google Gemini API key used for new company provisioning',
        category: 'ai',
        isPublic: false,
        updatedAt: new Date(),
      },
    });
    
    logger.info(`Platform default API key updated by admin ${adminUserId}`);
    
    return { success: true, message: 'Platform default API key updated successfully' };
    
  } catch (error: any) {
    logger.error('Failed to set platform default API key', { error });
    return { success: false, message: error.message || 'Operation failed' };
  }
}

/**
 * Get platform default API key (decrypted)
 * Only for internal use by provisioning system
 */
export async function getPlatformDefaultAPIKey(): Promise<string | null> {
  try {
    const setting = await db.platformSetting.findUnique({
      where: { key: 'ai_default_api_key' },
    });
    
    if (!setting?.value) return null;
    
    // Decrypt the key
    const { decryptSecret } = await import('@/lib/cryptoVault');
    return await decryptSecret(setting.value);
    
  } catch (error) {
    logger.warn('Could not decrypt platform default API key', { error });
    return null;
  }
}

// ── Export ─────────────────────────────────────────────────

export default {
  provisionAIForNewCompany,
  batchProvisionMissingCompanies,
  setPlatformDefaultAPIKey,
  getPlatformDefaultAPIKey,
};
