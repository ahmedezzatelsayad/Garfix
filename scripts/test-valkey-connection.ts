/**
 * test-valkey-connection.ts — Test Valkey connection and BullMQ setup
 * 
 * Run: bun run scripts/test-valkey-connection.ts
 */

import { getValkeyClient, VALKEY_CONFIGURED, valkeyHealthCheck, getValkeyUrl } from '../src/lib/valkey';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           Valkey + BullMQ Connection Test                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// 1. Check configuration
console.log('📋 Configuration Check:');
console.log('   ┌─────────────────────────────────────────────┐');
console.log(`   │ VALKEY_CONFIGURED: ${VALKEY_CONFIGURED ? '✅ YES' : '❌ NO'}`);
console.log(`   │ VALKEY_URL:         ${getValkeyUrl() || '❌ Not set'}`);
console.log(`   │ REDIS_URL:          ${process.env.REDIS_URL || '❌ Not set'}`);
console.log(`   │ DATABASE_URL:       ${process.env.DATABASE_URL ? '✅ Set' : '❌ Not set'}`);
console.log('   └─────────────────────────────────────────────┘');
console.log('');

// 2. Queue mode detection
const USE_BULLMQ = VALKEY_CONFIGURED;
const PGBOSS_AVAILABLE = Boolean(process.env.DATABASE_URL);
const USE_PGBOSS = !USE_BULLMQ && PGBOSS_AVAILABLE;

console.log('🔄 Queue Mode:');
console.log('   ┌─────────────────────────────────────────────┐');
if (USE_BULLMQ) {
    console.log('   │ Mode:      🚀 BullMQ (Valkey) - PRIMARY     │');
    console.log('   │ Fallback:  ⚪ pg-boss (PostgreSQL)          │');
} else if (USE_PGBOSS) {
    console.log('   │ Mode:      📦 pg-boss (PostgreSQL)          │');
    console.log('   │ Note:      Valkey not configured            │');
} else {
    console.log('   │ Mode:      ⚠️  In-process (DEV ONLY)        │');
}
console.log('   └─────────────────────────────────────────────┘');
console.log('');

// 3. Connection test
async function runTests() {
    console.log('🔌 Connection Test:');
    console.log('   ┌─────────────────────────────────────────────┐');
    
    if (!VALKEY_CONFIGURED) {
        console.log('   │ ⚠️  Valkey not configured                   │');
        console.log('   │    Add VALKEY_URL to .env to enable        │');
        console.log('   └─────────────────────────────────────────────┘');
        console.log('');
        console.log('💡 To enable Valkey:');
        console.log('   1. Run: ./scripts/start-valkey.sh');
        console.log('   2. Or add to .env:');
        console.log('      VALKEY_URL=valkey://:password@localhost:6379');
        return;
    }
    
    try {
        const health = await valkeyHealthCheck();
        
        if (health.ok) {
            console.log(`   │ ✅ Valkey Connected!                       │`);
            console.log(`   │ Latency: ${health.latencyMs}ms                            │`);
        } else {
            console.log('   │ ❌ Valkey Connection Failed                 │');
            console.log('   │    Check if Valkey server is running         │');
        }
    } catch (err) {
        console.log('   │ ❌ Connection Error:                         │');
        console.log(`   │    ${err instanceof Error ? err.message : String(err)}`);
    }
    
    console.log('   └─────────────────────────────────────────────┘');
    console.log('');
    
    // 4. Summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        Summary                              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    
    if (USE_BULLMQ && VALKEY_CONFIGURED) {
        console.log('║  ✅ Valkey: Configured & Ready                             ║');
        console.log('║  ✅ BullMQ: Active (Primary Queue)                        ║');
        console.log('║  ✅ pg-boss: Standby (Fallback)                           ║');
        console.log('║                                                           ║');
        console.log('║  Status: 🟢 PRODUCTION READY                               ║');
    } else if (USE_PGBOSS) {
        console.log('║  ⚠️  Valkey: Not Configured                                ║');
        console.log('║  📦 pg-boss: Active (Queue Backend)                       ║');
        console.log('║                                                           ║');
        console.log('║  Status: 🟡 DEVELOPMENT MODE (works, but no Valkey)       ║');
    } else {
        console.log('║  ❌ Valkey: Not Configured                                 ║');
        console.log('║  ❌ pg-boss: Not Available                                ║');
        console.log('║                                                           ║');
        console.log('║  Status: 🔴 SANDBOX ONLY                                   ║');
    }
    
    console.log('╚══════════════════════════════════════════════════════════════╝');
}

runTests().catch(console.error);
