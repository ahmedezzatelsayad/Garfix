# Benchmark Governance Document
## Invoice Brain Matching System

**Version:** 1.0.0  
**Status:** **ACTIVE** (Frozen until Golden Dataset Validation Complete)  
**Effective Date:** 2026-08-02  
**Owner:** CTO / Engineering Lead  

---

## 📋 Purpose

This document establishes the **operational rules** governing the Invoice Brain Benchmark Protocol. It is **not a technical specification**—it is a governance framework designed to ensure:

1. **Measurement Integrity:** Results are trustworthy and reproducible
2. **Decision Quality:** Go/No-Go decisions are based on evidence, not optimism
3. **Accountability:** Clear rules prevent "moving the goalposts"

---

## 🔒 Core Principles

### Principle 1: Protocol Immutability During Validation

> **"Once validation begins, the rules of the game cannot change."**

| Rule | Description | Exception |
|------|-------------|-----------|
| **1.1** | Protocol v1.0 is **FROZEN** from Golden Dataset start date | None |
| **1.2** | No threshold modifications during active validation | Critical bug in calculation logic only |
| **1.3** | No metric additions/removals during validation | None |
| **1.4** | No scenario changes to Robustness Suite | None |

### Principle 2: Version Control Discipline

> **"Every change creates a new version. Old versions never disappear."**

```
Protocol v1.0 (FROZEN - Current)
    ↓ [If change needed]
Protocol v1.1 (New version number required)
    ↓
Protocol v2.0 (Major changes)
```

**Rules:**

| Action | Required Change |
|--------|-----------------|
| Fix typo in documentation | No version change |
| Modify any threshold | Minor version bump (v1.0 → v1.1) |
| Add/remove metric or scenario | Major version bump (v1.0 → v2.0) |
| Change statistical methodology | Major version bump (v1.0 → v2.0) |

### Principle 3: Dataset Traceability

> **"Every result must be traceable to a specific dataset version."**

| Dataset Version | Source | Status | Use Case |
|-----------------|--------|--------|----------|
| `synthetic-v1` | Generated | Complete | Gate 0, 1, 1.5 (PASSED_SYNTHETIC) |
| `golden-v1` | Production Export | **PENDING COLLECTION** | Gate 2 (Target) |
| `pilot-v1` | Live Traffic | Future | Gate 3 (Production) |

**Rule 3.1:** Never compare results across different dataset versions without explicit annotation.

**Rule 3.2:** Any change to Golden Dataset composition requires new dataset version (golden-v2).

---

## 🚫 Forbidden Actions During Golden Dataset Phase

### ❌ DO NOT:

1. **Modify matching engine code** for performance optimization
2. **Tune thresholds** based on early results preview
3. **Add new features** to the benchmark suite
4. **Remove "embarrassing" scenarios** from robustness tests
5. **Change data preprocessing** pipeline
6. **Update ML models** (embeddings, classifiers)

### ✅ ALLOWED:

1. **Fix critical bugs** that prevent protocol execution (documented in changelog)
2. **Add logging/observability** (does not affect metrics)
3. **Documentation improvements** (does not affect logic)
4. **Infrastructure scaling** (if current setup cannot handle 5000 invoices)

---

## 🔄 The Validation Cycle (Mandatory Order)

```
┌─────────────────────────────────────────────────────────────┐
│                    VALIDATION LIFECYCLE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ① FREEZE                                                  │
│      ├─ Lock Protocol v1.0                                  │
│      ├─ Lock Thresholds                                     │
│      ├─ Lock Scenarios                                      │
│      └─ Create Benchmark Manifest                           │
│                                                             │
│         ↓                                                   │
│                                                             │
│   ② COLLECT                                                 │
│      ├─ Acquire ≥5,000 real invoices                        │
│      ├─ Validate distribution per spec                     │
│      ├─ Populate all metadata fields                       │
│      └─ Document data lineage                               │
│                                                             │
│         ↓                                                   │
│                                                             │
│   ③ RUN                                                     │
│      ├─ Execute Protocol v1.0 AS-IS                         │
│      ├─ No manual interventions                             │
│      └─ Generate Benchmark Manifest + Report                │
│                                                             │
│         ↓                                                   │
│                                                             │
│   ④ ANALYZE                                                 │
│      ├─ Compare Synthetic vs Golden results                 │
│      ├─ Calculate Delta Report                              │
│      ├─ Root Cause Analysis for gaps                       │
│      └─ Document findings objectively                       │
│                                                             │
│         ↓                                                   │
│                                                             │
│   ⑤ DECIDE                                                  │
│      ├─ If gap < 2× → GO to Phase D                        │
│      ├─ If gap > 2× → NO-GO, return to engine               │
│      └─ Decision is FINAL for this cycle                    │
│                                                             │
│         ↓                                                   │
│                                                             │
│   ⑥ FIX (Only AFTER decision)                               │
│      ├─ Based on analysis findings                          │
│      ├─ Create NEW protocol version if needed               │
│      └─ Restart cycle from Step ①                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### ⚠️ CRITICAL: The Wrong Cycle

```
❌ FORBIDDEN PATTERN:
   Collect → Discover Issue → Fix → Collect → Run
   
   This INVALIDATES the validation because:
   - Fixes are biased toward discovered issues
   - Unknown issues remain undiscovered
   - Results are no longer representative
```

---

## 📊 Decision Authority Matrix

| Decision Type | Authority | Documentation Required |
|--------------|-----------|------------------------|
| Start Golden Dataset collection | Engineering Lead + CTO approval | Email sign-off |
| Protocol bug fix during validation | Engineering Lead + Peer review | Bug report + Fix PR |
| Threshold change (any) | **CTO only** | Change Request Form v2 |
| Abort validation cycle | Engineering Lead + CTO | Incident report |
| Declare PASSED_GOLDEN | **CTO only** | Full validation report |
| Declare FAILED + return to engine | Engineering Lead + CTO | Analysis report |

---

## 📝 Reporting Requirements

### Mandatory Reports (in order):

#### 1. **Benchmark Manifest** (Generated automatically)
```yaml
protocol_version: 1.0.0
dataset_version: golden-v1
timestamp: ...
commit_hash: ...
seed: 12345
```

#### 2. **Gate Execution Report**
- Per-gate verdict (NOT_EXECUTED / FAILED / PASSED_*)
- All metrics with Wilson CI
- Error budget status
- Latency breakdown

#### 3. **Delta Report** (Synthetic vs Golden Comparison)
| Metric | Synthetic | Golden | Delta | Interpretation |
|--------|-----------|--------|-------|----------------|
| FMR | 0.75% | ?% | ?x | ... |
| Precision | 99.4% | ?% | ?pp | ... |
| Recall | 99.3% | ?% | ?pp | ... |
| AI Fallback Rate | 0.15% | ?% | ?x | ... |
| Supplier Confusion | 0.38% | ?% | ?x | ... |
| p50 Latency | 70ms | ?ms | ?ms | ... |
| Error Budget | EXCEEDED | ? | - | ... |

**Most Important Column = Interpretation** (Not the numbers!)

#### 4. **Root Cause Analysis** (If gap > 2×)
- Why did synthetic differ from golden?
- Which assumptions were wrong?
- What needs to change?

---

## ⚖️ Interpretation Rules

### Rule: Synthetic Results Usage

| Context | Can Use Synthetic? | Reasoning |
|---------|-------------------|-----------|
| Framework validation | ✅ Yes | Proves measurement works |
| Algorithm comparison | ✅ Yes | Relative comparisons valid |
| **Production Go/No-Go** | ❌ **NO** | Not real-world evidence |
| Investor reporting | ⚠️ With disclaimer | Must label "Projected" |
| Team motivation | ⚠️ Carefully | Avoid false confidence |

### Rule: Verdict Promotion Path

```
NOT_EXECUTED
    ↓ (execute on Synthetic)
FAILED
    ↓ (fix and re-execute)
PASSED_SYNTHETIC  ← We are here
    ↓ (execute on SAME protocol with Golden)
PASSED_GOLDEN     ← Target
    ↓ (execute on Pilot)
PASSED_PRODUCTION ← Final goal
```

**Rule:** Never skip a level. Each promotion requires explicit validation.

---

## 🎯 Success Criteria for Golden Dataset Phase

### Minimum for PASSED_GOLDEN:

| Criterion | Threshold |
|-----------|-----------|
| FMR (Golden) | ≤ 1.5% (3× synthetic acceptable) |
| FMR Gap (Golden/Synthetic) | < 3× |
| All scenarios pass | ≥ 9/11 |
| Error Budget | ALL_WITHIN_BUDGET |
| Sample size | n ≥ 5000 |
| Distribution compliance | All categories meet minimum % |

### If ANY criterion fails → FAILED (not conditional pass)

---

## 📜 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-02 | CTO Review | Initial governance framework |

---

## ✅ Sign-Off

This document becomes effective upon CTO signature:

**Protocol Freeze Authorization:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Author | _________________ | _________________ | _______ |
| Engineering Lead | _________________ | _________________ | _______ |
| CTO | _________________ | _________________ | _______ |

---

## 📌 Key Reminders (Print and Post)

```
╔══════════════════════════════════════════════════════════════╗
║           BENCHMARK GOVERNANCE - REMINDERS                   ║
╠══════════════════════════════════════════════════════════════╣
║                                                            ║
║  1. Protocol v1.0 is FROZEN                                ║
║     → No changes during Golden Dataset phase                ║
║                                                            ║
║  2. The Cycle is: FREEZE → COLLECT → RUN → ANALYZE → FIX  ║
║     → NOT: Collect → Fix → Collect → Fix                  ║
║                                                            ║
║  3. Synthetic ≠ Production Evidence                        ║
║     → Always label as "PROMISING" not "VALIDATED"          ║
║                                                            ║
║  4. Every change = New Version                             ║
║     → v1.0 → v1.1 (threshold tweak)                        ║
║     → v1.0 → v2.0 (metric/scenario change)                 ║
║                                                            ║
║  5. Most Important Column = INTERPRETATION                  ║
║     → Not the numbers, but what they MEAN                  ║
║                                                            ║
╚══════════════════════════════════════════════════════════════╝
```

---

**Document Status:** ACTIVE  
**Next Review:** After Golden Dataset Validation Complete  
**Distribution:** Engineering Team, CTO, Project Stakeholders  
