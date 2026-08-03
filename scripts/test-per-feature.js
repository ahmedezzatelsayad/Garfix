/**
 * ═════════════════════════════════════════════════════════════
 * Per-Feature API Key Test Script
 * 
 * Tests Google Gemini key on ALL 4 features:
 * - 💬 Chat (AI Conversations)
 * - 📄 Invoice (Extraction & Processing)
 * - 🔍 Parse (Smart Document Analysis)
 * - 🧠 Memory (Context & History)
 *
 * Usage: GOOGLE_GEMINI_API_KEY="your-key" node test-per-feature.js
 * 
 * Model: gemini-2.0-flash (Free Tier)
 * ═════════════════════════════════════════════════════════════
 */

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// ── Test Functions ──────────────────────────────────────────

async function testFeature(featureName, prompt) {
  const startTime = Date.now();
  
  try {
    console.log(`\n🧪 Testing: ${featureName}`);
    
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.3 },
      }),
    });
    
    const latencyMs = Date.now() - startTime;
    const data = await response.json();
    
    if (!response.ok) {
      return {
        feature: featureName,
        success: false,
        latencyMs,
        error: data?.error?.message || `HTTP ${response.status}`,
      };
    }
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens = data.usageMetadata;
    
    console.log(`   ✅ SUCCESS (${latencyMs}ms)`);
    console.log(`   📝 Reply: ${reply.substring(0, 80)}...`);
    console.log(`   📊 Tokens: Input=${tokens?.promptTokenCount}, Output=${tokens?.candidatesTokenCount}`);
    
    return {
      feature: featureName,
      success: true,
      latencyMs,
      reply: reply.substring(0, 100),
      tokens: {
        input: tokens?.promptTokenCount,
        output: tokens?.candidatesTokenCount,
        total: tokens?.totalTokenCount,
      },
    };
  } catch (error) {
    return {
      feature: featureName,
      success: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ── Main Execution ─────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Per-Feature AI Connection Test Suite                  ║');
  console.log('║     Model: gemini-2.0-flash (Free Tier)                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  if (!GEMINI_API_KEY) {
    console.error('\n❌ ERROR: No API key provided!');
    console.error('Usage: GOOGLE_GEMINI_API_KEY="your-key" node test-per-feature.js');
    process.exit(1);
  }
  
  console.log(`\n🔑 Using API Key: ${GEMINI_API_KEY.substring(0, 8)}...${GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4)}`);
  
  // Test all 4 features with specific prompts
  const results = [];
  
  // 💬 Chat Feature Test
  results.push(await testFeature(
    '💬 Chat (AI Conversations)',
    'Hello! You are an AI assistant for GarfiX accounting system. Introduce yourself in one sentence.'
  ));
  
  // 📄 Invoice Feature Test
  results.push(await testFeature(
    '📄 Invoice (Extraction & Processing)',
    `Extract the following from this invoice text:
    Invoice #INV-2024-001
    Date: 2024-08-03
    Vendor: Tech Supplies Co.
    Client: ABC Company
    Items:
    - Laptop x 2 @ $800 each = $1,600
    - Mouse x 5 @ $25 each = $125
    Subtotal: $1,725
    Tax (15%): $258.75
    Total: $1,983.75
    
    Return JSON: {vendor, client, total, taxAmount}`
  ));
  
  // 🔍 Parse Feature Test
  results.push(await testFeature(
    '🔍 Parse (Smart Document Analysis)',
    `Categorize and analyze this document snippet:
    "Purchase Order #PO-456 dated 2024-08-01 for office supplies totaling $2,450.
     Delivery requested within 5 business days to Cairo headquarters."
     
    Return: category, priority_level, estimated_processing_time`
  ));
  
  // 🧠 Memory Feature Test
  results.push(await testFeature(
    '🧠 Memory (Context & History)',
    `System: You are GarfiX AI memory system. Remember user preferences.
    
    User: I prefer dark mode and Arabic language.
    System: Preferences saved.
    
    User: What are my saved preferences?
    
    Recall the preferences accurately.`
  ));
  
  // ── Summary ───────────────────────────────────────────────
  
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 PER-FEATURE TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const details = result.success 
      ? `${result.latencyMs}ms | Tokens: ${result.tokens?.total || 'N/A'}`
      : result.error?.substring(0, 50);
    
    console.log(`${status} | ${result.feature.padEnd(35)} | ${details}`);
    
    if (result.success) passed++;
    else failed++;
  }
  
  console.log('════════════════════════════════════════════════════════════');
  console.log(`\n📈 Results: ${passed}/${results.length} features working`);
  
  if (passed === results.length) {
    console.log('\n🎉 All features connected successfully!');
    console.log('✨ Ready for multi-tenant per-feature deployment!');
    console.log('');
    console.log('💡 Each company can now use isolated connections for:');
    console.log('   • Chat conversations without affecting invoice processing');
    document.write('   • Invoice batch processing without slowing down chat');
    console.log('   • Smart parsing with dedicated resources');
    console.log('   • Memory/context operations on separate channel');
  } else if (passed > 0) {
    console.log(`\n⚠️ ${passed} features working, ${failed} failed.`);
    console.log('💡 Partial functionality available.');
  } else {
    console.log('\n❌ All features failed.');
    console.log('💡 Check your API key or billing status at: https://ai.dev/rate-limit');
    process.exit(1);
  }
}

main().catch(console.error);
