/**
 * AI Personalization Library — GarfiX DS v4.0
 *
 * ════════════════════════════════════════════════════════════════════════
 * Core AI Personalization System
 *
 * EXPORTS:
 * - Types: All type definitions for the personalization system
 * - Provider: React context provider and hook
 *
 * USAGE:
 * ```tsx
 * import { AIPersonalizationProvider, useAIPersonalization } from '@/lib/ai-personalization'
 * 
 * // Or import types
 * import type { UserProfile, UserPreferences } from '@/lib/ai-personalization'
 * ```
 */

export * from './types';
export { AIPersonalizationProvider, useAIPersonalization } from './AIPersonalizationProvider';
