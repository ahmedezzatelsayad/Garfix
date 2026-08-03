/**
 * Google Gemini API Key Test Script (JavaScript)
 * 
 * Tests: Chat, Metrics, Memory
 */

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function testChat() {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Chat (GenerateContent)');
    
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Hello! You are a smart assistant for an accounting system. Briefly introduce yourself.' }]
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
      return { test: 'Chat', success: false, latencyMs, error: data?.error?.message || `HTTP ${response.status}` };
    }
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';
    
    console.log(`✅ Chat Success! (${latencyMs}ms)`);
    console.log(`📝 Reply: ${reply.substring(0, 100)}...`);
    
    return { test: 'Chat', success: true, latencyMs, data: { model: data.modelVersion, reply } };
  } catch (error) {
    return { test: 'Chat', success: false, latencyMs: Date.now() - startTime, error: error.message };
  }
}

async function testMetrics() {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Metrics (Token Counting & Usage)');
    
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `
            Financial analysis for Example Company:
            - Q1 Revenue: $1,250,000
            - Operating Expenses: $875,000
            - Net Profit: $375,000
            - Profit Margin: 30%
            
            Analyze these numbers and evaluate financial performance.
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
      return { test: 'Metrics', success: false, latencyMs, error: data?.error?.message || `HTTP ${response.status}` };
    }
    
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
      data: { tokenUsage: usageMetadata },
    };
  } catch (error) {
    return { test: 'Metrics', success: false, latencyMs: Date.now() - startTime, error: error.message };
  }
}

async function testMemory() {
  const startTime = Date.now();
  
  try {
    console.log('\n🧪 Testing: Memory (Context & Conversation History)');
    
    const response = await fetch(`${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `You are a smart assistant for GarfiX accounting system.
            
            Context:
            - Company: Al-Nour Trading Co.
            - Currency: Egyptian Pound (EGP)
            - Business Type: Wholesale Trade
            
            Always remember this context when responding.`
          }],
        },
        contents: [
          { role: 'user', parts: [{ text: 'What is the company currency and main business?' }] },
          { role: 'model', parts: [{ text: 'The company uses Egyptian Pound (EGP) and their main business is wholesale trade.' }] },
          { role: 'user', parts: [{ text: 'Correct! Now add a sales invoice for 5000 EGP' }] },
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
      return { test: 'Memory', success: false, latencyMs, error: data?.error?.message || `HTTP ${response.status}` };
    }
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';
    
    console.log(`✅ Memory/Context Success! (${latencyMs}ms)`);
    console.log(`📝 Reply: ${reply.substring(0, 150)}...`);
    
    return {
      test: 'Memory',
      success: true,
      latencyMs,
      data: { hasSystemInstruction: true, conversationTurns: 3, reply },
    };
  } catch (error) {
    return { test: 'Memory', success: false, latencyMs: Date.now() - startTime, error: error.message };
  }
}

// Main
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Google Gemini API Key Test Suite                      ║');
  console.log('║     Key: AQ...TxqePw (Google Gemini)                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const results = [];
  
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
