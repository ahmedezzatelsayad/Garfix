# ADR 005: Implement 16-Phase AI Cost Optimization Cascade

- **Status**: Accepted
- **Date**: 2025-01-15
- **Deciders**: Engineering Team, AI Fabric Owner

## Context

GARFIX EOS relies heavily on AI for invoice parsing, product matching, chat assistance, and smart automation. AI API costs (OpenRouter, OpenAI, Anthropic) are a significant operational expense that grows linearly with user count. Without optimization, AI costs can exceed revenue per customer at scale.

The AI Fabric module (`src/lib/ai-fabric/`) processes every AI request through a pipeline that must balance cost, quality, and latency. The challenge:

1. **Cost per invoice**: Without optimization, AI parsing costs ~$0.05/invoice. At 10,000 invoices/month, that's $500/month in AI costs alone.
2. **Quality requirements**: Invoice data must be extracted with high accuracy — errors create financial discrepancies.
3. **Latency requirements**: Users expect sub-2-second responses for chat, and sub-30-second responses for bulk processing.
4. **Multi-provider landscape**: Different providers have different cost/quality tradeoffs (GPT-4o is expensive but accurate; GPT-3.5 is cheap but less accurate).

## Decision

We implement a **16-phase AI cost optimization cascade** in the `gateway.ts` module. Each AI request passes through these phases sequentially, and the cascade stops at the first phase that successfully resolves the request:

| Phase | Name | Description | Cost |
|---|---|---|---|
| 1 | **Semantic Cache Hit** | Exact or near-match from embedding cache | $0 |
| 2 | **Pattern Store Match** | Fingerprint-based pattern from Invoice Brain | $0 |
| 3 | **Header Map Match** | Column header mapping from previous extractions | $0 |
| 4 | **Learning Engine Match** | Historical pattern from learning engine | $0 |
| 5 | **Budget Engine Gate** | Check if tenant has remaining AI budget | $0 |
| 6 | **AI Score Pre-filter** | Determine if AI is actually needed (simple invoice = skip) | $0 |
| 7 | **Smart Router - cheapest model** | Route to cheapest model that can handle the task | ~$0.001 |
| 8 | **Smart Router - balanced model** | Route to cost-balanced model (GPT-4o-mini) | ~$0.005 |
| 9 | **Smart Router - premium model** | Route to premium model (GPT-4o) | ~$0.02 |
| 10 | **Provider Optimizer** | Real-time provider cost/latency comparison | $0 |
| 11 | **Context Window Optimization** | Reduce token count by trimming context | $0 (saves ~30%) |
| 12 | **Worker Prediction** | Predict worker type and preload | $0 |
| 13 | **Worker Marketplace** | Select optimal worker from marketplace | $0 |
| 14 | **Cross-company Intelligence** | Shared pattern knowledge across tenants | $0 |
| 15 | **Digital Twin Simulation** | Simulate outcome before committing resources | $0 |
| 16 | **Profit Engine Validation** | Ensure request is profitable for the platform | $0 |

Security gate: Every AI action that modifies data must pass through a **human confirmation gate** before execution. AI can suggest, but cannot execute without explicit user approval.

## Consequences

### Positive
- 85-95% cost reduction through caching phases (phases 1-4)
- Budget control per tenant prevents overspend
- Quality maintained through smart routing (cheap → balanced → premium)
- Progressive fallback: if cheap model fails, escalate automatically
- Cross-tenant intelligence pool improves accuracy for all users
- Profit engine ensures platform doesn't lose money on AI-heavy tenants

### Negative
- Complex cascade logic — 16 phases with interactions is hard to reason about
- Testing challenge — must verify each phase independently and in combination
- Cache invalidation complexity — when patterns change, stale cache results must be evicted
- Monitoring overhead — must track which phase resolves each request for analytics

### Neutral
- Phase execution order matters — earlier phases must be fast to avoid adding latency
- Some phases are async (worker prediction) — requires careful concurrency management
- Digital twin simulation is experimental — may not always be accurate

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **Single model (GPT-4o)** | Simple implementation; best quality | Very expensive; no cost optimization | Rejected — unsustainable at scale |
| **Single cheap model (GPT-3.5)** | Low cost | Quality insufficient for financial data | Rejected — accuracy requirements |
| **Two-tier (cheap + premium)** | Simpler than 16-phase | Misses caching opportunities; less optimization | Partially accepted — phases 7-9 implement this |
| **On-premise LLM** | Zero API cost | Hardware cost; maintenance; quality issues | Future consideration — not yet viable |
| **No AI at all** | Zero AI cost | No competitive advantage | Rejected — core product feature |
