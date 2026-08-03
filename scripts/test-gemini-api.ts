/**
 * ═════════════════════════════════════════════════════════════
 * Google Gemini API Key Test Script
 * 
 * Tests the provided Gemini key on:
 * 1. Chat (GenerateContent)
 * 2. Metrics (Token counting)
 * 3. Memory (Context storage)
 * 
 * Usage: GOOGLE_GEMINI_API_KEY=your-key node test-gemini-api.ts
 * ═════════════════════════════════════════════════════════════
 */

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface TestResult {
  test: string;
  success: boolean;
  latencyMs: number;
  data?: any;
  error?: string;
}

async function testChat(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Chat (GenerateContent)');
    
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'مرحباً! أنت مساعد ذكي لنظام محاسبة. رد باختصار عن نفسك.' }]
        }],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.7,
        },
      }),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        test: 'Chat',
        success: false,
        latencyMs,
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';
    
    console.log(`✅ Chat Success! (${latencyMs}ms)`);
    console.log(`📝 Reply: ${reply.substring(0, 100)}...`);
    
    return {
      test: 'Chat',
      success: true,
      latencyMs,
      data: { model: data.modelVersion, reply },
    };
  } catch (error: any) {
    return {
      test: 'Chat',
      success: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function testMetrics(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Metrics (Token Counting & Usage)');
    
    // Test with a longer prompt to measure tokens
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `
            تحليل مالي لشركة مثال:
            - إيرادات الربع الأول: 1,250,000 ج.م
            - المصاريف التشغيلية: 875,000 ج.م
            - صافي الربح: 375,000 ج.م
            - هامش الربح: 30%
            
            قم بتحليل هذه الأرقام واعطِ تقييم للأداء المالي.
          ` }]
        }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.3,
        },
      }),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        test: 'Metrics',
        success: false,
        latencyMs,
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    // Extract usage metadata
    const usageMetadata = data.usageMetadata;
    
    console.log(`✅ Metrics Success! (${latencyMs}ms)`);
    console.log('📊 Token Usage:');
    console.log(`   - Prompt Tokens: ${usageMetadata?.promptTokenCount || 'N/A'}`);
    console.log(`   - Candidates Tokens: ${usageMetadata?.candidatesTokenCount || 'N/A'}`);
    console.log(`   - Total Tokens: ${usageMetadata?.totalTokenCount || 'N/A'}`);
    
    return {
      test: 'Metrics',
      success: true,
      latencyMs,
      data: {
        tokenUsage: usageMetadata,
        analysis: data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100),
      },
    };
  } catch (error: any) {
    return {
      test: 'Metrics',
      success: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function testMemory(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Memory (Context & Conversation History)');
    
    // Simulate a conversation with context/memory
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `أنت مساعد ذكي لنظام GarfiX المحاسبي.
            
            معلومات السياق:
            - اسم الشركة: شركة النور للتجارة
            - العملة: جنيه مصري (ج.م)
            - نوع النشاط: تجارة الجملة
            
            تذكر دائماً هذه المعلومات عند الرد على الاستفسارات.`
          }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'ما هي عملة الشركة وما هو نشاطها الرئيسي؟' }]
          },
          {
            role: 'model', 
            parts: [{ text: 'الشركة تعمل بعملة الجنيه المصري (ج.م) ونشاطها الرئيسي هو تجارة الجملة.' }]
          },
          {
            role: 'user',
            parts: [{ text: 'صحيح! الآن أضف فاتورة مبيعات بقيمة 5000 ج.م' }]
          },
        ],
        generationConfig: {
          maxOutputTokens: 150,
          temperature: 0.5,
        },
      }),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        test: 'Memory',
        success: false,
        latencyMs,
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';
    
    console.log(`✅ Memory/Context Success! (${latencyMs}ms)`);
    console.log(`📝 Reply: ${reply.substring(0, 150)}...`);
    
    return {
      test: 'Memory',
      success: true,
      latencyMs,
      data: {
        hasSystemInstruction: true,
        conversationTurns: 3,
        reply,
      },
    };
  } catch (error: any) {
    return {
      test: 'Memory',
      success: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ── Main Execution ──────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Google Gemini API Key Test Suite                      ║');
  console.log('║     Key: AQ...TxqePw (Google Gemini)                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const results: TestResult[] = [];
  
  // Run tests sequentially
  results.push(await testChat());
  results.push(await testMetrics());
  results.push(await testMemory());
  
  // Summary
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  
  let allPassed = true;
  
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${result.test.padEnd(10)} | ${result.latencyMs}ms | ${result.error || 'OK'}`);
    if (!result.success) allPassed = false;
  }
  
  console.log('════════════════════════════════════════════════════════════');
  
  if (allPassed) {
    console.log('🎉 All tests passed! The Gemini API key is working correctly.');
    console.log('');
    console.log('✨ Ready for multi-tenant integration!');
  } else {
    console.log('⚠️ Some tests failed. Check the errors above.');
    process.exit(1);
  }
}

main().catch(console.error);
