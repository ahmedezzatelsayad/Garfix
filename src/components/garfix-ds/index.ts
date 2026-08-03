/**
 * ════════════════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 — Component Library
 * 
 * 🎨 Complete Design System Component Library for GarfiX EOS Platform
 * 
 * ════════════════════════════════════════════════════════════════════════
 * 
 * STRUCTURE:
 * ────────────────────────────────────────────────────────────────────────
 * 1. Core Components     → Button, Card, Input, Badge, Avatar
 * 2. Layout Components   → Container, Grid, PageHeader, Section
 * 3. Data Display        → DataTable, StatCard, SparklineChart
 * 4. Feedback            → Alert, Progress (Bar/Ring/Step), Skeleton
 * 5. Navigation          → Tabs, Sidebar, MobileNav, Breadcrumb
 * 6. Overlay             → Modal/Dialog, Drawer, ConfirmDialog
 *
 * DESIGN TOKENS:
 * ────────────────────────────────────────────────────────────────────────
 * • Primary:    #047857 (Emerald Deep)
 * • Accent:     #d4a574 (Champagne Gold) ⚠️ RESTRICTED: AI/Premium only!
 * • Background: #0b1220 (Dark), #f0fdf4 (Light)
 * • Surface:    #111827 (Dark), #ffffff (Light)
 * • Elevated:   #1f2937 (Dark), #ffffff with shadow (Light)
 *
 * MOTION SYSTEM:
 * ────────────────────────────────────────────────────────────────────────
 * • Hover:      120ms cubic-bezier(0.4, 0, 0.2, 1)
 * • Button:     150ms cubic-bezier(0.4, 0, 0.2, 1)
 * • Drawer:     250ms cubic-bezier(0.4, 0, 0.2, 1)
 * • Modal:      220ms cubic-bezier(0.4, 0, 0.2, 1)
 * • Page:       300ms cubic-bezier(0.25, 0.1, 0.25, 1)
 * • Toast:      180ms cubic-bezier(0.4, 0, 0.2, 1)
 *
 * USAGE EXAMPLES:
 * ────────────────────────────────────────────────────────────────────────
 * ```tsx
 * // Import individual components
 * import { GarfixButton, GarfixCard } from '@/components/garfix-ds'
 * 
 * // Import specific categories
 * import { GarfixDataTable, KPICardGrid } from '@/components/garfix-ds/data'
 * 
 * // Use preset components
 * import { PrimaryButton, GoldButton, SuccessAlert } from '@/components/garfix-ds'
 * ```
 *
 * ════════════════════════════════════════════════════════════════════════
 */

// ── 1. Core Components ──────────────────────────────────────────────────

export {
  GarfixButton,
  PrimaryButton,
  SecondaryButton,
  GoldButton,
  DangerButton,
} from './core/GarfixButton'

export type {
  GarfixButtonProps,
  ButtonVariant,
  ButtonSize,
} from './core/GarfixButton'

export {
  GarfixCard,
  GarfixCardHeader,
  GarfixCardTitle,
  GarfixCardDescription,
  GarfixCardContent,
  GarfixCardFooter,
  KPICard,
} from './core/GarfixCard'

export type {
  GarfixCardProps,
  CardVariant,
  CardPadding,
  KPIColor,
  KPICardProps,
} from './core/GarfixCard'

export { GarfixInput } from './core/GarfixInput'

export type {
  GarfixInputProps,
  InputSize,
  InputState,
} from './core/GarfixInput'

export {
  GarfixBadge,
  StatusBadge,
  NotificationBadge,
} from './core/GarfixBadge'

export type {
  GarfixBadgeProps,
  BadgeVariant,
  BadgeSize,
} from './core/GarfixBadge'

export {
  GarfixAvatar,
  GarfixAvatarGroup,
} from './core/GarfixAvatar'

export type {
  GarfixAvatarProps,
  AvatarSize,
  AvatarStatus,
  AvatarGroupProps,
} from './core/GarfixAvatar'

// ── 2. Layout Components ───────────────────────────────────────────────

export { GarfixContainer, GarfixSection } from './layout/GarfixContainer'

export type {
  GarfixContainerProps,
  ContainerVariant,
  ContainerPadding,
  GarfixSectionProps,
} from './layout/GarfixContainer'

export {
  GarfixGrid,
  KPICardGrid,
  FormGrid,
  CardGrid,
  ContentGrid,
} from './layout/GarfixGrid'

export type {
  GarfixGridProps,
  GridCols,
  GridGap,
} from './layout/GarfixGrid'

export { GarfixPageHeader, GarfixTitle } from './layout/GarfixPageHeader'

export type {
  GarfixPageHeaderProps,
  BreadcrumbItem as PageHeaderBreadcrumbItem,
  GarfixTitleProps,
} from './layout/GarfixPageHeader'

// ── 3. Data Display ─────────────────────────────────────────────────────

export { GarfixDataTable } from './data/GarfixDataTable'

export type {
  GarfixDataTableProps,
  Column as DataTableColumn,
  TableDensity,
  SortDirection,
} from './data/GarfixDataTable'

export { GarfixStatCard, SparklineChart } from './data/GarfixStatCard'

export type {
  GarfixStatCardProps,
  StatColor,
  StatTrend,
  SparklineChartProps,
} from './data/GarfixStatCard'

// ── 4. Feedback Components ──────────────────────────────────────────────

export {
  GarfixAlert,
  SuccessAlert,
  ErrorAlert,
  WarningAlert,
} from './feedback/GarfixAlert'

export type {
  GarfixAlertProps,
  AlertVariant,
  AlertSize,
} from './feedback/GarfixAlert'

export {
  GarfixProgressBar,
  GarfixProgressRing,
  GarfixStepProgress,
} from './feedback/GarfixProgress'

export type {
  GarfixProgressBarProps,
  GarfixProgressRingProps,
  GarfixStepProgressProps,
  StepItem,
  ProgressColor,
  ProgressSize,
} from './feedback/GarfixProgress'

export {
  GarfixSkeleton,
  CardSkeleton,
  TableRowSkeleton,
  FormSkeleton,
  DashboardSkeleton,
  ProfileSkeleton,
} from './feedback/GarfixSkeleton'

export type {
  GarfixSkeletonProps,
  SkeletonShape,
  SkeletonVariant,
} from './feedback/GarfixSkeleton'

// ── 5. Navigation ───────────────────────────────────────────────────────

export { GarfixTabs, GarfixTabPanel } from './navigation/GarfixTabs'

export type {
  GarfixTabsProps,
  TabItem,
  TabVariant,
  TabSize,
  GarfixTabPanelProps,
} from './navigation/GarfixTabs'

export { GarfixSidebar, GarfixMobileNav } from './navigation/GarfixSidebar'

export type {
  GarfixSidebarProps,
  SidebarItem,
  SidebarGroup,
  GarfixMobileNavProps,
} from './navigation/GarfixSidebar'

export { GarfixBreadcrumb } from './navigation/GarfixBreadcrumb'

export type {
  GarfixBreadcrumbProps,
  BreadcrumbItemData,
} from './navigation/GarfixBreadcrumb'

// ── 6. Overlay Components ───────────────────────────────────────────────

export { GarfixModal, GarfixConfirmDialog } from './overlay/GarfixModal'

export type {
  GarfixModalProps,
  ModalSize,
  ConfirmDialogProps,
} from './overlay/GarfixModal'

export { GarfixDrawer } from './overlay/GarfixDrawer'

export type {
  GarfixDrawerProps,
  DrawerSide,
  DrawerSize,
} from './overlay/GarfixDrawer'
