# Data Qualification Framework
## Invoice Brain - Golden Dataset Quality Gates

**Version:** 1.0.0  
**Status:** ACTIVE  
**Purpose:** Ensure every data batch meets quality standards BEFORE entering Golden Dataset  

---

## 🎯 Overview

> **"أي دفعة لا تحقق هذه الشروط لا تدخل Golden Dataset"**

This framework establishes quality gates that MUST be passed by each data batch before it can be included in `golden-dataset-v1`.

---

## 📋 Phase 0: Pre-Collection Setup

### Required Infrastructure:
- [ ] Secure storage for PII data (encrypted at rest)
- [ ] Annotation tool/platform configured
- [ ] Reviewer access controls set up
- [ ] Batch tracking spreadsheet/database ready
- [ ] SHA-256 calculation tool available

### Team Roles:
| Role | Responsibility | Access |
|------|----------------|--------|
| **Data Collector** | Gathers raw invoices | Raw data only |
| **Data Annotator** | Creates ground truth | Annotations only |
| **Quality Reviewer** | Validates annotations | Read-only on engine |
| **Custodian** | Manages dataset integrity | Manifest + fingerprints |

---

## 🔍 Phase 1: Data Qualification Checklist

### Per-Batch Quality Gates

Each batch MUST pass ALL checks before acceptance:

#### Gate 1: PII Removal (100% Required)

| Check | Method | Threshold | Action if Fail |
|-------|--------|-----------|----------------|
| Supplier names masked | Regex scan | 100% removal | Reject batch |
| Invoice numbers hashed | SHA-256 applied | 100% hashing | Reject batch |
| Monetary amounts preserved | Validation | All present | Flag for review |
| Dates anonymized | Year/month only | Format consistent | Reject batch |

```python
# Example PII check script output:
Batch ID: BATCH-001
Total Invoices: 500
PII Scan Results:
  - Supplier Names: 500/500 masked ✅
  - Invoice Numbers: 500/500 hashed ✅
  - Addresses: 498/500 removed ⚠️ (2 manual review)
VERDICT: CONDITIONAL_PASS (requires manual review of 2 items)
```

#### Gate 2: Ground Truth Completeness (≥99%)

| Field | Required | Tolerance | Check Method |
|-------|----------|-----------|--------------|
| Correct supplier ID | 100% | 0% missing | Automated cross-reference |
| Invoice total match | 100% | 0% missing | Numeric validation |
| Currency code | ≥99% | ≤1% missing | Enum validation |
| Line items count | ≥98% | ≤2% fuzzy | Range check |

**Ground Truth Review Process:**
```
┌─────────────────────────────────────────────┐
│  Double Review for Critical Cases           │
│  ─────────────────────────────────────────  │
│                                             │
│  1. Primary Annotator labels invoice        │
│         ↓                                   │
│  2. Secondary Annotator reviews CRITICAL     │
│     cases only:                             │
│     - Similar supplier names               │
│     - Shared ERP templates                 │
│     - High OCR noise (>15%)                │
│     - Known duplicate suppliers            │
│         ↓                                   │
│  3. Disagreement → Third reviewer decides   │
│         ↓                                   │
│  4. Final GT locked (immutable)             │
│                                             │
└─────────────────────────────────────────────┘
```

#### Gate 3: Data Integrity (<5% Corrupted)

| Issue Type | Definition | Max Allowed | Detection |
|------------|------------|-------------|-----------|
| Unreadable pages | Blank/corrupted scans | <2% | Visual check |
| Missing headers | No supplier/total info | <3% | Schema validation |
| Truncated content | Cut-off text/tables | <2% | Page count check |
| Duplicate files | Same hash, different name | 0% | Hash dedup |

#### Gate 4: Supplier Distribution (No Single Supplier >10%)

**Anti-Bias Check:**
```bash
# Run after each batch
$ python check_supplier_distribution.py --batch BATCH-002

Results:
  Total Invoices: 1500
  Unique Suppliers: 85
  
  Top 5 Suppliers:
  1. "Acme Corp"      : 142 invoices (9.5%) ✅ (<10%)
  2. "Global Trade"   : 118 invoices (7.9%) ✅
  3. "Mega Suppliers" :  95 invoices (6.3%) ✅
  4. "Local LLC"       :  82 invoices (5.5%) ✅
  5. "Trading Co"      :  71 invoices (4.7%) ✅

  Distribution Score: PASS ✅
  Warning: No single supplier exceeds 10%
```

**If ANY supplier >10%:**
- ❌ Reject batch
- 📝 Return to collector with explanation
- 🔄 Request more diverse sampling

#### Gate 5: Template Distribution Compliance

Compare batch distribution against target spec:

| Category | Target | Batch Actual | Variance | Status |
|----------|--------|--------------|----------|--------|
| Shared ERP | 30% | 28% | -2% | ✅ OK |
| Arabic Only | 20% | 22% | +2% | ✅ OK |
| Low Quality | 20% | 15% | -5% | ⚠️ WARNING |
| Multi-page | 15% | 18% | +3% | ✅ OK |

**Variance Rule:** ±5% acceptable per batch (will balance in final aggregate)

---

## 🧊 Phase 2: Golden Dataset Freeze

### Upon Collection Completion:

#### Step 1: Final Assembly
```bash
#!/bin/bash
# freeze_golden_dataset.sh

echo "=== Freezing Golden Dataset v1 ==="

# 1. Combine all approved batches
mkdir -p golden-dataset-v1/invoices
cp batches/*/approved/*.json golden-dataset-v1/invoices/

# 2. Count final inventory
TOTAL=$(ls golden-dataset-v1/invoices/ | wc -l)
echo "Total Invoices: $TOTAL"

# 3. Calculate SHA-256 fingerprint
FINGERPRINT=$(find golden-dataset-v1 -type f -exec sha256sum {} \; | sha256sum)
echo "Dataset Fingerprint: $FINGERPRINT"

# 4. Create freeze manifest
cat > golden-dataset-v1/MANIFEST.json << EOF
{
  "version": "v1",
  "frozen_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "fingerprint_sha256": "$FINGERPRINT",
  "total_invoices": $TOTAL,
  "batches_included": ["BATCH-001", "BATCH-002", "BATCH-003"],
  "status": "IMMUTABLE",
  "custodian": "$(whoami)"
}
EOF

echo "=== Dataset Frozen ==="
echo "Any modification will change fingerprint"
```

#### Step 2: Immutable Storage
- [ ] Upload to secure, read-many-write-once storage
- [ ] Backup to separate geographic region
- [ ] Email fingerprint to stakeholders
- [ ] Document freeze in project logbook

#### Step 3: Access Control
| Role | Post-Freeze Access |
|------|-------------------|
| Data Collector | ❌ Revoked |
| Data Annotator | ❌ Revoked |
| Benchmark Runner | ✅ Read-only |
| Quality Reviewer | ✅ Read-only |
| Custodian | ✅ Manifest updates only |

---

## 👁️ Phase 3: Blind Validation Protocol

### Objective: Eliminate Unintentional Bias

> **"فريق جمع البيانات لا يغيّر المحرك. فريق المحرك لا يطّلع على Ground Truth قبل انتهاء التشغيل"**

### Separation Matrix:

| Team | Can See | Cannot See | Interaction Point |
|------|---------|------------|-------------------|
| **Data Team** | Raw invoices, GT | Engine code, thresholds | Delivery only |
| **Engine Team** | Engine code, config | GT labels, expected results | Execution only |
| **Validation Team** | Both results | Neither source directly | Comparison only |

### Blind Validation Process:

```
┌─────────────────────────────────────────────────────────────┐
│                  BLIND VALIDATION FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  DATA TEAM (Room A)          ENGINE TEAM (Room B)           │
│  ──────────────────          ─────────────────              │
│                                                             │
│  1. Prepare frozen dataset   1. Receive dataset (no GT)    │
│  2. Separate GT file     →   2. Run Protocol v1.0 AS-IS    │
│  3. Deliver invoices only     3. Generate predictions       │
│                             4. Export results (no peeking) │
│                                     ↓                       │
│                                                             │
│                    VALIDATION TEAM (Room C)                  │
│                    ─────────────────────────                │
│                                                             │
│              5. Receive predictions ←──┐                   │
│              6. Receive ground truth ──→┤                   │
│              7. Compare & calculate metrics                  │
│              8. Generate Delta Report                        │
│              9. Publish verdict                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Anti-Tampering Measures:
1. **GT encrypted** until validation step
2. **Engine logs timestamped** (no backdating)
3. **No communication** between Data/Engine teams during execution
4. **Results signed digitally** after generation

---

## 📦 Phase 4: Batch-Based Collection Strategy

### Recommended Batch Sizes:

| Batch | Size | Purpose | Duration | Exit Criteria |
|-------|------|---------|----------|---------------|
| **Batch 1** | 500 | Process validation | 3-5 days | Qualification passes, workflow tested |
| **Batch 2** | 1,500 | Scale-up | 7-10 days | Distribution targets met |
| **Batch 3** | 3,000 | Completion | 14-21 days | Full spec achieved |

**Total: 5,000 invoices**

### Why This Approach?

```
❌ RISK OF COLLECTING ALL AT ONCE:
   
   Collect 5000 → Discover labeling issue at invoice #4000
   → 4000 invoices need re-labeling
   → Massive rework
   → Timeline explosion

✅ BENEFIT OF BATCHED APPROACH:

   Batch 1 (500) → Test workflow → Fix issues early ✓
   Batch 2 (1500) → Scale confident → Minor tweaks ✓
   Batch 3 (3000) → Complete efficiently → Done ✓
```

### Per-Batch Workflow:

```
┌──────────────────────────────────────────────────────────────┐
│  BATCH WORKFLOW (Repeat for each batch)                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ① COLLECT                                                  │
│     ├─ Gather raw invoices from source                      │
│     ├─ Apply initial PII masking                            │
│     └─ Store in staging area                                 │
│                         ↓                                    │
│  ② QUALIFY (Run Checklist)                                  │
│     ├─ Gate 1: PII Removal (100%)                           │
│     ├─ Gate 2: GT Completeness (≥99%)                       │
│     ├─ Gate 3: Integrity (<5% corrupted)                    │
│     ├─ Gate 4: Supplier Dist (<10% any one)                 │
│     └─ Gate 5: Template Compliance (±5%)                    │
│                         ↓                                    │
│  ③ DECIDE                                                   │
│     ├─ ALL PASS → Accept batch                              │
│     ├─ MINOR ISSUES → Fix, re-check                         │
│     └─ MAJOR FAILS → Reject batch, return to collector      │
│                         ↓                                    │
│  ④ ARCHIVE                                                  │
│     ├─ Move to approved/ folder                             │
│     ├─ Update batch manifest                                │
│     └─ Continue to next batch                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 Quality Tracking Dashboard

### Track These Metrics Per Batch:

| Metric | Batch 1 | Batch 2 | Batch 3 | Target |
|--------|---------|---------|---------|--------|
| Invoices Collected | /500 | /1500 | /3000 | 5000 |
| Pass Rate (First Attempt) | ?% | ?% | ?% | >80% |
| GT Disagreement Rate | ?% | ?% | ?% | <2% |
| PII Issues Found | ? | ? | ? | 0 |
| Supplier Skew (Max %) | ?% | ?% | ?% | <10% |
| Template Variance | ? | ? | ? | ±5% |

---

## ✅ Sign-Off Requirements

### Before Starting Collection:
- [ ] Data Qualification Framework approved
- [ ] PII handling procedures documented
- [ ] Annotation guidelines finalized
- [ ] Reviewer team assigned
- [ ] Blind validation process agreed upon

### After Each Batch:
- [ ] Qualification checklist completed
- [ ] Issues documented (if any)
- [ ] Batch custodian sign-off
- [ ] Next batch triggered (or corrections needed)

### After Full Collection:
- [ ] All 3 batches accepted
- [ ] Dataset freeze performed
- [ ] Fingerprint calculated and distributed
- [ ] Ready for Blind Validation (Sprint 2)

---

## 🚨 Escalation Procedures

| Issue Type | Example Action | Escalate To |
|------------|----------------|-------------|
| Persistent PII failures | Stop collection, review tooling | Data Protection Officer |
| GT disagreement >5% | Halt, retrain annotators | Engineering Lead |
| Supplier skew cannot fix | Source new suppliers | Project Sponsor |
| Batch fail rate >30% | Pause, review entire process | CTO |

---

**Document Version:** 1.0.0  
**Effective Date:** 2026-08-02  
**Next Review:** After Batch 1 completion  
