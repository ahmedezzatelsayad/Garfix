/**
 * GarfiX EOS Design System v4.0 - Component Exports
 * 
 * This barrel file exports all DS v4.0 components for easy importing.
 * 
 * @example
 * ```tsx
 * import { 
 *   GarfixEnterpriseTable, 
 *   GarfixNotifications, 
 *   GarfixStates,
 *   KpiCardV4 
 * } from '@/components/ui/index-garfix-ds'
 * ```
 */

// ── Enterprise Table System (Section D) ────────────────────────────────
export {
  GarfixEnterpriseTable,
  GarfixBulkActions,
  GarfixEditableCell,
} from './GarfixEnterpriseTable'

export type {
  EnterpriseTableProps,
  BulkActionsProps,
  EditableCellProps,
  ColumnDef,
  Density,
  RowStatus,
} from './GarfixEnterpriseTable'

// ── Notification System (Section E) ────────────────────────────────────
export {
  GarfixToast,
  GarfixBanner,
  GarfixConfirmDialog,
  GarfixToastProvider,
  useGarfixToast,
} from './GarfixNotifications'

export type {
  ToastProps,
  BannerProps,
  ConfirmDialogProps,
  ToastAction,
  ToastOptions,
  UseToastReturn,
} from './GarfixNotifications'

// ── State Library (Section B) ─────────────────────────────────────────
export {
  GarfixEmptyState,
  GarfixLoadingState,
  GarfixErrorState,
  GarfixOfflineState,
  GarfixMaintenanceState,
  GarfixSkeleton,
  GarfixPageState,
} from './GarfixStates'

export type {
  EmptyStateProps,
  LoadingStateProps,
  ErrorStateProps,
  OfflineStateProps,
  MaintenanceStateProps,
  SkeletonProps,
  PageStateProps,
  IllustrationType,
  LoadingVariant,
  ErrorSeverity,
} from './GarfixStates'

// ── Re-export commonly used UI components ─────────────────────────────
// These are the base shadcn/ui components that work with our tokens
export { Button } from './button'
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
export { Badge } from './badge'
export { Input } from './input'
export { Label } from './label'
export { Progress } from './progress'
export { Skeleton as ShadcnSkeleton } from './skeleton'
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
export { Alert, AlertTitle, AlertDescription } from './alert'
export { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './tooltip'
