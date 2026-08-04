/**
 * AI Components — GarfiX DS v4.0
 *
 * ════════════════════════════════════════════════════════════════════════
 * AI-Powered Personalization Components
 * 
 * These components use machine learning and behavior analysis to provide
 * personalized, intelligent user experiences.
 *
 * ⚠️ Gold accent (#d4a574) is used sparingly for AI-specific features
 * ════════════════════════════════════════════════════════════════════════
 */

// ── Provider & Context ────────────────────────────────────────────────

export {
  AIPersonalizationProvider,
  useAIPersonalization,
} from '@/lib/ai-personalization/AIPersonalizationProvider'

export type {
  AIPersonalizationProviderProps,
} from '@/lib/ai-personalization/AIPersonalizationProvider'

export type {
  AIPersonalizationContextValue,
  UserProfile,
  UserPreferences,
  AIInsight,
  Recommendation,
  AdaptiveUIState,
  BehaviorEventType,
} from '@/lib/ai-personalization/types'

export type {
  // Re-export types for convenience
  InsightType,
  InsightCategory,
  RecommendationType,
  RecommendationSource,
  UserRole,
  TeamSize,
  FrequentFeature,
  RecentItem,
  SuggestedAction,
} from '@/lib/ai-personalization/types'

// ── AI Insights Panel ───────────────────────────────────────────────

export { GarfixAIInsights, GarfixInsightCard } from './GarfixAIInsights'

export type {
  GarfixAIInsightsProps,
  GarfixInsightCardProps,
} from './GarfixAIInsights'

// ── Smart Recommendations ─────────────────────────────────────────

export { GarfixSmartRecommendations } from './GarfixSmartRecommendations'

export type {
  GarfixSmartRecommendationsProps,
} from './GarfixSmartRecommendations'

// ── Personalized Actions ───────────────────────────────────────────

export { GarfixPersonalizedActions } from './GarfixPersonalizedActions'

export type {
  GarfixPersonalizedActionsProps,
} from './GarfixPersonalizedActions'

// ── Learning Progress ──────────────────────────────────────────────

export { GarfixAILearningProgress } from './GarfixAILearningProgress'

export type {
  GarfixAILearningProgressProps,
} from './GarfixAILearningProgress'
