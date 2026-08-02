# Invoice Brain - Golden Validation Roadmap
## Phase: Evidence Generation (Not Framework Development)

**Status:** READY TO EXECUTE  
**Protocol Version:** v1.0 (FROZEN)  
**Governance:** Benchmark-Governance.md (ACTIVE)  
**Last Updated:** 2026-08-02  

---

## 🎯 Project Status Transition

```
┌─────────────────────────────────────────────────────────────┐
│  COMPLETED: Measurement Infrastructure Phase                 │
│  ─────────────────────────────────────────────────────────  │
│  ✅ Verification Suite (23 Invariants)                       │
│  ✅ Ablation Study Framework                                │
│  ✅ Gate 1.5 Robustness Protocol                            │
│  ✅ Wilson Confidence Intervals                             │
│  ✅ Error Budget System                                     │
│  ✅ Benchmark Manifest (Reproducibility)                    │
│  ✅ Golden Dataset Specification                            │
│  ✅ Benchmark Governance Document                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  CURRENT: Evidence Generation Phase                         │
│  ─────────────────────────────────────────────────────────  │
│  🎯 Goal: Collect real data, run frozen protocol, decide    │
│  ⚠️  Rule: NO new frameworks until Golden validation done   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 3-Sprint Roadmap

### **Sprint 1: Golden Dataset Collection** ⏳

**Objective:** Acquire `golden-dataset-v1` meeting specification requirements

#### Deliverables:
- [ ] **≥ 5,000 real invoices** from production/historical data
- [ ] **Distribution compliance** per `golden-dataset-specification.json`:

| Category | Target | Min | Max |
|----------|--------|-----|-----|
| Shared ERP Templates | 30% | 20% | 40% |
| OCR Quality Issues | 25% | 15% | 35% |
| Arabic-Only | 20% | 15% | 30% |
| Arabic + English Mixed | 30% | 20% | 40% |
| Multi-Page | 15% | 10% | 25% |
| Low-Quality Scans | 20% | 15% | 30% |
| Duplicate Supplier Variations | 10% | 5% | 15% |
| Similar-Sounding Suppliers | 15% | 10% | 20% |

- [ ] **Metadata completeness** (all required fields populated)
- [ ] **Double Ground Truth Review** for critical samples:
  - Similar supplier names
  - Shared ERP layouts
  - High OCR noise cases
- [ ] **Dataset validation** using `GoldenDatasetValidator`

#### Exit Criteria:
```bash
node scripts/run-golden-dataset-demo.js  # Must show: ✅ PASSED
```

#### Output Artifact:
```
data/golden-dataset-v1/
├── invoices/           # ≥5000 JSON/PDF files
├── metadata.json       # Distribution summary
├── ground-truth.csv    # Correct matches
└── manifest.json       # Data lineage
```

---

### **Sprint 2: Protocol Execution** ⏳

**Objective:** Run `Protocol v1.0 AS-IS` on golden dataset

#### Constraints (NON-NEGOTIABLE):
- ❌ No threshold modifications
- ❌ No matching engine changes
- ❌ No model retraining
- ❌ No scenario additions/removals
- ❌ No data preprocessing changes

#### Execution Steps:
```bash
# 1. Create Benchmark Manifest
node -e "
const { BenchmarkManifestBuilder } = require('./scripts/invoice-brain-golden-dataset-spec');
const builder = new BenchmarkManifestBuilder();
builder.createManifest({
  datasetVersion: 'golden-v1',
  totalInvoices: 5000,
  // ... environment details
});
"

# 2. Run Frozen Protocol
node scripts/invoice-brain-gate15-robustness.js \
  --dataset ./data/golden-dataset-v1 \
  --output ./download/golden-validation-report-v1.json

# 3. Verify Manifest Integrity
# Ensure manifest matches execution exactly
```

#### Output Artifacts:
```
download/
├── benchmark-manifest-golden-v1.json     # Reproducibility proof
├── golden-validation-report-v1.json      # Full results
└── gate-verdicts-golden-v1.json          # Per-gate decisions
```

---

### **Sprint 3: Delta Analysis & Decision** ⏳

**Objective:** Compare Synthetic vs Golden, make Go/No-Go decision

#### Deliverable: Delta Report

| Metric | Synthetic | Golden | Δ (Factor) | Root Cause | Interpretation |
|--------|-----------|--------|-------------|------------|----------------|
| **FMR** | 0.75% | ?% | ?x | ? | ? |
| **Precision** | 99.4% | ?% | ?pp | ? | ? |
| **Recall** | 99.3% | ?% | ?pp | ? | ? |
| **AI Fallback Rate** | 0.15% | ?% | ?x | ? | ? |
| **Supplier Confusion** | 0.38% | ?% | ?x | ? | ? |
| **p50 Latency** | 70ms | ?ms | ?ms | ? | ? |
| **p99 Latency** | 210ms | ?ms | ?ms | ? | ? |
| **Error Budget** | EXCEEDED | ? | - | ? | ? |

#### Decision Matrix:

| Condition | Decision | Action |
|-----------|----------|--------|
| FMR(Golden) ≤ 1.5% AND Gap < 3× | **✅ GO** | Proceed to Phase D planning |
| FMR(Golden) > 1.5% OR Gap > 3× | **❌ NO-GO** | Return to engine with fix list |
| Edge case (mixed results) | **⚠️ CONDITIONAL** | CTO decision required |

#### Required Sign-Off:
- [ ] Engineering Lead analysis complete
- [ ] Delta Report reviewed by peer
- [ ] CTO final decision documented

---

## ⚠️ Risks & Mitigations

### Risk 1: Selection Bias
**Threat:** Golden dataset comes from "clean" or known suppliers only.

**Mitigation:**
| Control | Implementation |
|---------|----------------|
| Hard case injection | Deliberately include 15% known-difficult invoices |
| Supplier diversity check | Verify no single supplier >10% of dataset |
| Temporal spread | Ensure 12+ month date range |
| Double review | Critical cases reviewed by 2 independent annotators |

### Risk 2: Dataset Drift
**Threat:** Model overfits to Golden v1, fails on future data.

**Mitigation:**
| Control | Implementation |
|---------|----------------|
| Holdout set | Reserve 500 invoices as `golden-v2-holdout` (NEVER use during optimization) |
| Drift monitoring | Plan quarterly re-validation post-production |
| Version control | Golden v1 is immutable; improvements use v2 |

---

## 🚫 POST-GOLDEN Improvements (NOT BEFORE)

> **"أقترح إضافة مؤشرين فقط بعد الانتهاء من Golden، وليس قبله"**

### Future Enhancement 1: Calibration Curve
**Question:** Does confidence score reflect true probability of correctness?

```
If system says 95% confidence → Is it correct ~95% of the time?

Perfect Calibration:
Predicted 95% → Actual 95% correct ✅
Predicted 80% → Actual 80% correct ✅

Miscalibration (common problem):
Predicted 95% → Actual 70% correct ❌ (Overconfident)
```

**Implementation:** After PASSED_GOLDEN confirmed

### Future Enhancement 2: Cost of Error Dashboard
**Question:** What's the operational impact of errors?

| Error Type | Detection Point | Operational Cost | Frequency |
|------------|-----------------|------------------|-----------|
| False Match (pre-posting) | System catches it | Retry cost | ? |
| False Match (post-posting) | Human review finds it | Reversal + audit | ? |
| Wrong Supplier | Finance notices | Correction + relationship | ? |
| Missed Duplicate | AP overpays | Financial loss | ? |

**Value:** Transforms accuracy report → business impact report

---

## 📊 Success Criteria Change

### OLD Mindset (Framework Phase):
```
✅ "I added a new feature"
✅ "I improved the algorithm"
✅ "I built a better test"
```

### NEW Mindset (Evidence Phase):
```
✅ "I presented new evidence"
✅ "I validated on real data"
✅ "I proved/dispoved a hypothesis"
```

---

## 📝 Checklist Before Starting Sprint 1

- [ ] Stakeholders aligned on 3-sprint plan
- [ ] Data source identified (production export? manual collection?)
- [ ] Annotation team assigned (if manual GT needed)
- [ ] Infrastructure ready for 5000+ invoice processing
- [ ] Governance document signed off
- [ ] Protocol v1.0 manifest created (frozen baseline)

---

## 🎯 One-Line Summary

> **"The project has transitioned from building measurement tools to using them. Success is now measured in evidence generated, not frameworks built."**

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-02 | Engineering Lead | Initial roadmap based on CTO guidance |

**Next Update:** After Sprint 3 completion (Go/No-Go decision)
