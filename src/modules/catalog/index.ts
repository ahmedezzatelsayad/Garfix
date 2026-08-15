/**
 * Catalog Components — مكونات الكتالوج والمنتجات
 *
 * يصدّر:
 * - ProductPicker: منتقي منتجات مع Autocomplete
 * - QuickCreateProductDialog: نافذة إنشاء سريع للمنتجات
 * - MatchStatusBadge: شارة حالة المطابقة
 */

export { ProductPicker } from "./ProductPicker";
export type { ProductOption, ProductPickerProps } from "./ProductPicker";

export { QuickCreateProductDialog } from "./QuickCreateProductDialog";
export type { ProductFormData, QuickCreateProductDialogProps } from "./QuickCreateProductDialog";

export { MatchStatusBadge, getMatchStatusFromResult } from "./MatchStatusBadge";
export type { MatchStatus, MatchStatusBadgeProps } from "./MatchStatusBadge";
