/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX AI - Main Export Index
 * 
 * Central export point for all GarfiX AI components and utilities.
 * ═══════════════════════════════════════════════════════════════
 */

// ── Phase 1: Core Brand & Basic Components ───────────────

export { GarfixAIIcon, GarfixAILogo, GarfixAIBadge } from './GarfixAIIcon'
export { AICopilotBubble, AIInlineSuggestion, AICommandInput, AIStatusBar, AITooltip } from './GarfixAIComponents'

// ── Phase 2: Contextual Integration ──────────────────────────

export { 
  AIEmptyState,
  AIFormField,
  AICategorizer,
  AISearchBar,
  AISummaryCard,
  EmptyInvoices,
  EmptyClients,
  EmptyProducts,
  EmptyReports,
  EmptySearch,
} from './GarfixAIContextual'

// ── Phase 3: Smart Actions ───────────────────────────────────

export { 
  AIInvoiceAssistant,
  AIDescribeInput,
  AIDashboardInsights,
  AIKpiCard,
  AISmartNav,
} from './GarfixAISmartActions'

// ── Phase 4: Proactive Intelligence ─────────────────────────

export { AINotificationCenter, AIMemoryContext, AIVoiceInput } from './GarfixAIProactive'

// ── Phase 5: Polish & Launch ───────────────────────────────

export { AICelebration, AIOnboardingTour, AIFeatureDiscovery, useAIPerformance } from './GarfixAIPolish'
