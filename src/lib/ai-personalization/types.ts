/**
 * ai-personalization.types.ts — GarfiX DS v4.0 AI Personalization Types
*
 * Phase 8 P3: SCAFFOLD ONLY — types + empty hooks, no AI integration.
 *
 * ════════════════════════════════════════════════════════════════════════
 * Complete Type Definitions for AI-Powered Personalization System
 *
 * CATEGORIES:
 * 1. User Profile & Preferences
 * 2. Behavior Tracking
 * 3. AI Insights & Recommendations
 * 4. Adaptive UI State
 * 5. Learning & Prediction Models
 *
 * ════════════════════════════════════════════════════════════════════════
 */

// ── 1. User Profile & Preferences ──────────────────────────────────────

export interface UserProfile {
  /** Unique user ID */
  id: string;
  /** User display name */
  name: string;
  /** User email */
  email: string;
  /** Account creation date */
  createdAt: Date;
  /** User role */
  role: UserRole;
  /** Company/organization info */
  company?: string;
  /** Industry sector */
  industry?: string;
  /** Team size */
  teamSize?: TeamSize;
}

export type UserRole = "owner" | "admin" | "manager" | "accountant" | "viewer";
export type TeamSize = "solo" | "small" | "medium" | "large" | "enterprise";

export interface UserPreferences {
  /** Language preference (default: ar) */
  language: "ar" | "en" | "fr";
  /** Theme preference */
  theme: "light" | "dark" | "system";
  /** Time format */
  timeFormat: "12h" | "24h";
  /** Date format */
  dateFormat: "gregorian" | "hijri";
  /** Currency display */
  currency: "EGP" | "USD" | "EUR" | "SAR" | "AED";
  /** Number formatting locale */
  numberLocale: "ar-EG" | "en-US";
  /** Start of week */
  startOfWeek: "saturday" | "sunday" | "monday";
  /** Notification preferences */
  notifications: NotificationPreferences;
  /** Dashboard layout preference */
  dashboardLayout: DashboardLayoutPreference;
  /** Data density preference */
  dataDensity: "comfortable" | "normal" | "compact";
  /** Animation preference */
  animationsEnabled: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: "realtime" | "hourly" | "daily" | "weekly";
  categories: NotificationCategory[];
}

export type NotificationCategory = 
  | "invoices" 
  | "payments" 
  | "reports" 
  | "alerts" 
  | "updates" 
  | "ai_insights";

export interface DashboardLayoutPreference {
  /** KPI cards visible */
  visibleKPIs: string[];
  /** Widget order */
  widgetOrder: string[];
  /** Sidebar collapsed by default */
  sidebarCollapsed: boolean;
  /** Default active tab */
  defaultTab: string;
}

// ── 2. Behavior Tracking ───────────────────────────────────────────────

export interface UserBehaviorEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: BehaviorEventType;
  /** Timestamp */
  timestamp: Date;
  /** Page/component where event occurred */
  context: EventContext;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Session ID */
  sessionId: string;
}

export type BehaviorEventType =
  | "page_view"
  | "click"
  | "search"
  | "filter"
  | "sort"
  | "export"
  | "create"
  | "edit"
  | "delete"
  | "share"
  | "print"
  | "download"
  | "login"
  | "logout"
  | "theme_change"
  | "preference_update"
  | "error"
  | "feedback";

export interface EventContext {
  page: string;
  component?: string;
  section?: string;
  deviceType?: "mobile" | "tablet" | "desktop";
  viewportSize?: { width: number; height: number };
}

export interface UserSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  events: UserBehaviorEvent[];
  deviceInfo: DeviceInfo;
  source?: "direct" | "bookmark" | "email" | "social" | "referral";
}

export interface DeviceInfo {
  type: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
  screenWidth: number;
  screenHeight: number;
  isTouchDevice: boolean;
}

// ── 3. AI Insights & Recommendations ─────────────────────────────────────

export interface AIInsight {
  /** Insight ID */
  id: string;
  /** Insight type */
  type: InsightType;
  /** Title (displayed to user) */
  title: string;
  /** Detailed description */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Priority level */
  priority: "low" | "medium" | "high" | "critical";
  /** Category */
  category: InsightCategory;
  /** Actionable items */
  actions: InsightAction[];
  /** Related metrics */
  relatedMetrics?: MetricRef[];
  /**
   * Human-readable estimate of the time the user could save by acting on
   * this insight (e.g. "5 ساعات/أسبوع"). Only populated for
   * `optimization_suggestion`-style insights.
   */
  estimatedTimeSaved?: string;
  /** When insight was generated */
  generatedAt: Date;
  /** Expiration (if applicable) */
  expiresAt?: Date;
  /** Status */
  status: "new" | "viewed" | "acknowledged" | "dismissed" | "actioned";
}

export type InsightType =
  | "anomaly_detection"
  | "trend_prediction"
  | "optimization_suggestion"
  | "alert"
  | "milestone"
  | "comparison"
  | "pattern_recognition"
  | "recommendation";

export type InsightCategory =
  | "revenue"
  | "expenses"
  | "cash_flow"
  | "productivity"
  | "compliance"
  | "growth"
  | "risk";

export interface InsightAction {
  id: string;
  label: string;
  type: "primary" | "secondary" | "link";
  action: () => void;
  icon?: React.ReactNode;
}

export interface MetricRef {
  name: string;
  value: number;
  change?: number;
  period: string;
}

// ── Recommendation Types ─────────────────────────────────────────────────

export interface Recommendation<T = unknown> {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  item: T;
  relevanceScore: number;
  reason: string;
  source: RecommendationSource;
  metadata?: Record<string, unknown>;
}

export type RecommendationType =
  | "feature_discovery"
  | "workflow_optimization"
  | "data_entry_shortcut"
  | "report_suggestion"
  | "template_recommendation"
  | "action_automation"
  | "learning_resource"
  | "peer_comparison";

export type RecommendationSource =
  | "behavior_analysis"
  | "collaborative_filtering"
  | "content_based"
  | "rule_based"
  | "ml_model"
  | "manual";

// ── 4. Adaptive UI State ─────────────────────────────────────────────────

export interface AdaptiveUIState {
  /** Frequently used features (for quick access) */
  frequentFeatures: FrequentFeature[];
  /** Smart shortcuts based on usage */
  smartShortcuts: SmartShortcut[];
  /** Personalized navigation order */
  navItemOrder: string[];
  /** Collapsed sections (user prefers hidden) */
  collapsedSections: string[];
  /** Pinned items */
  pinnedItems: string[];
  /** Recently accessed items */
  recentItems: RecentItem[];
  /** Suggested next actions */
  suggestedActions: SuggestedAction[];
}

export interface FrequentFeature {
  featureId: string;
  name: string;
  icon?: string;
  useCount: number;
  lastUsed: Date;
  trend: "increasing" | "stable" | "decreasing";
}

export interface SmartShortcut {
  id: string;
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  triggerConditions: ShortcutTrigger[];
  estimatedTimeSaved: string; // e.g., "5 min/day"
}

export interface ShortcutTrigger {
  type: "time_of_day" | "day_of_week" | "page_context" | "data_pattern";
  value: string | number | boolean;
}

export interface RecentItem {
  id: string;
  type: "invoice" | "client" | "report" | "product" | "transaction";
  title: string;
  url: string;
  accessedAt: Date;
  thumbnailUrl?: string;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  action: () => void;
  urgency: "low" | "medium" | "high";
  reason: string;
}

// ── 5. Learning & Prediction ────────────────────────────────────────────

export interface LearningModel {
  version: string;
  lastTrained: Date;
  accuracy: number;
  features: LearnedFeature[];
}

export interface LearnedFeature {
  name: string;
  importance: number; // 0-1
  category: "behavioral" | "temporal" | "contextual" | "demographic";
}

export interface PredictionResult {
  prediction: unknown;
  confidence: number;
  factors: PredictionFactor[];
  modelVersion: string;
  timestamp: Date;
}

export interface PredictionFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  weight: number;
  description: string;
}

// ── 6. Personalization Context Value ────────────────────────────────────

export interface AIPersonalizationContextValue {
  // User
  user: UserProfile | null;
  preferences: UserPreferences;
  
  // Behavior tracking
  trackEvent: (event: Omit<UserBehaviorEvent, "id" | "timestamp" | "sessionId">) => void;
  currentSession: UserSession | null;
  
  // Insights & Recommendations
  insights: AIInsight[];
  recommendations: Recommendation[];
  getRecommendations: (type?: RecommendationType) => Recommendation[];
  dismissInsight: (id: string) => void;
  acknowledgeInsight: (id: string) => void;
  
  // Adaptive UI
  adaptiveUI: AdaptiveUIState;
  addFrequentFeature: (feature: FrequentFeature) => void;
  addRecentItem: (item: RecentItem) => void;
  
  // Learning
  isLearning: boolean;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  
  // Actions
  refreshInsights: () => Promise<void>;
  provideFeedback: (itemId: string, feedback: "positive" | "negative") => Promise<void>;
}
