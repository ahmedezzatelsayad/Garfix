# AI-09 — Dead-Code Decision (Gemini LB / Alert Manager / GarfiX Brain)

**Audit**: P3-AI-09 (Audit v2 · Phase 3)
**Branch**: `phase-3-p2-extinction`
**Date**: 2026-08-13
**Owner**: Senior AI Engineer

## 1. Background

The Phase 8 P3 audit flagged ~2,500 LOC across three AI infrastructure modules
as "DEAD CODE — kept for future wiring":

| Module                                |  LOC  | Original comment                                     |
| ------------------------------------- | ----: | ---------------------------------------------------- |
| `src/lib/ai/alert-manager.ts`         | 1022  | "DEAD CODE — 1000 LOC, zero callers"                 |
| `src/lib/ai/garfix-brain.ts`          |  802  | "DEAD CODE — imported only by ai/index.ts re-export" |
| `src/lib/ai/gemini-loadbalancer.ts`   |  640  | (no dead-code comment, but imported only by Brain)   |
| `src/lib/workers/aiWorkers.ts`        |  794  | (no dead-code comment, but described as "itself dead") |

The audit hypothesis was that all four were unreachable from runtime paths.

## 2. Investigation (this fix)

A repository-wide grep for every exported symbol from each module was run:

| Module              | Production callers found                                              |
| ------------------- | --------------------------------------------------------------------- |
| `alert-manager.ts`  | `src/app/api/ai/alerts/route.ts` — `getAlertManager()` called on every GET/POST |
| `garfix-brain.ts`   | `src/lib/workers/aiWorkers.ts` — `getGarfixBrain().chat(...)` inside `handleChatJob` |
| `aiWorkers.ts`      | `src/runtime/bootstrap.ts` — `registerAIWorkers()` invoked at boot    |
| `gemini-loadbalancer.ts` | `src/lib/ai/garfix-brain.ts` — `getGeminiLoadBalancer()` used for actual chat calls |

The "dead code" labels were **stale**: each module is now reachable from a
production code path.

## 3. Decision

**For each module: ACTIVATE (do not delete).**

| Module              | Decision     | Rationale                                                                |
| ------------------- | ------------ | ------------------------------------------------------------------------ |
| `alert-manager.ts`  | ACTIVATED    | Already wired to a founder-only REST API; deleting would remove a P5-C2 production endpoint. |
| `garfix-brain.ts`   | ACTIVATED    | Used as the chat handler by the AI queue worker (registered at boot).    |
| `gemini-loadbalancer.ts` | ACTIVATED | Direct dependency of `garfix-brain.ts`; deleting would break the chat handler. |
| `aiWorkers.ts`      | ACTIVATED    | `registerAIWorkers()` is called from `src/runtime/bootstrap.ts`.         |

The stale `DEAD CODE` comments have been replaced with `AI-09 FIX (Audit v2 · Phase 3)`
headers explaining the new status and the remaining gaps.

## 4. Remaining gaps (tracked separately, NOT blocking)

1. **AlertManager has no producer.** The REST API can read/ack/resolve/suppress
   alerts, but no internal caller invokes `manager.evaluateConditions(...)`
   against live metrics. Wiring the trigger requires the
   `getAdvancedLoadBalancer().getMetrics()` signal to be promoted from
   "best-effort observability" to "production-stable trigger source".
   Deferred.

2. **AI queue has zero enqueuers from the HTTP path.** `registerAIWorkers()`
   registers the consumer, but `/api/ai/chat` calls `callAI` synchronously
   instead of `enqueueChatJob`. This is the AI-10 finding — addressed by
   AI-10 in this same Phase 3 batch (see `scripts/enqueue-deferred-ai.ts`).

3. **GeminiLoadBalancer is Gemini-specific.** Smart Router (AI-03) routes by
   capability across providers; GeminiLoadBalancer is only consulted by
   GarfixBrain.chat(). Not dead, but narrow in scope. Acceptable for now.

## 5. Files touched

- `src/lib/ai/alert-manager.ts` — header comment updated.
- `src/lib/ai/garfix-brain.ts` — header comment updated.
- `docs/audits/ai-09-dead-code-decision.md` — this document.

## 6. Verification

- `bunx tsc --noEmit` passes with 0 errors after the comment edits
  (comments are not type-checked).
- No runtime behavior change — only docstrings updated.
- The grep inventory in §2 is reproducible:
  `rg "alert-manager|AlertManager|alertManager"` → 2 files
  `rg "garfix-brain|GarfixBrain"` → 5 files (incl. tests)
  `rg "registerAIWorkers"` → 5 files (incl. bootstrap.ts)
