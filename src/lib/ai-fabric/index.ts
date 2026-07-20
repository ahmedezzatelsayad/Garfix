/**
 * ai-fabric/index.ts — Barrel export for the AI Fabric system.
 *
 * Phase 0-16: Complete AI intelligence cascade with cost optimization,
 * worker scaling, budget engine, learning, and economics layer.
 */

// Core types
export * from "./types";

// Phase 1: AI Gateway (5-stage cascade)
export { executeCascade, storeAIMemory, cacheStore } from "./gateway";

// Phase 2: Cost Optimizer
export { calculateSavedCost, getCascadeBreakdown, getPlatformSavings } from "./cost-optimizer";

// Phase 3: Provider Optimizer
export { getProviderRouting, callWithProviderRouting, seedProviderConfigs } from "./provider-optimizer";

// Phase 4: Worker Scaler
export { getOrCreateRuntime, scaleWorkers, getActiveWorkerCounts } from "./worker-scaler";

// Phase 5: Smart Queue Scheduler
export { getAllocationMap, scheduleNextJob, requestSlot } from "./scheduler";

// Phase 6: Budget Engine
export { recordSpend, getBudgetStatus, checkBudgetGate, forecastMonthlySpend } from "./budget-engine";

// Phase 7: Digital Twin
export { buildCompanySnapshot, getCachedSnapshot } from "./digital-twin";

// Phase 8: Profit Engine
export { saveProfitSnapshot, getProfitHistory, getPlatformProfit } from "./profit-engine";

// Phase 9: Worker Marketplace
export { prioritizeRequest, canPreempt, getGlobalPoolStatus, findPreemptableJob } from "./worker-marketplace";

// Phase 10: Heat Map
export { getHeatMap, getPredictiveScale, hasEnoughData } from "./heat-map";

// Phase 11: Learning Engine
export { recordObservation, promoteCandidates, getLearningStatus, MIN_SAMPLES, MIN_CONFIDENCE } from "./learning-engine";

// Phase 12: Cross-Company Intelligence
export { contributePattern, lookupGlobalPattern, getPatternStats, verifyNoSensitiveData } from "./cross-company-intelligence";

// Phase 13: Worker Prediction
export { getUpcomingEvents, shouldPreScale, executePreScale, getPostEventScaleDown, KNOWN_EVENTS } from "./worker-prediction";

// Phase 14: AI Score
export { computeAndSaveScore, getLatestScore, getAllScores } from "./ai-score";

// Phase 15: Cost per Invoice
export { getCostPerInvoice, getCostPerInvoiceTrend, linkInvoiceCost } from "./cost-per-invoice";

// Phase 16: AI Compiler
export { clusterAIRequests, assessClusterForCompilation, getCompilationCandidates } from "./ai-compiler";