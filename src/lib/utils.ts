import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Coerce a value to a typed array. Defensive helper for paginated views:
 * API responses occasionally come back as objects (`{users: [...]}`) or
 * `undefined`, and calling `.slice()` on those crashes the dashboard with
 * "T.slice is not a function". This guarantees a real array every time.
 *
 *   const users = asArray<SaaSUser>(usersData?.users ?? usersData);
 */
export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

/**
 * Safe pagination slice — never throws, never returns undefined.
 * Used by all paginated views so a malformed API response can't crash
 * the entire dashboard.
 *
 * The input array is typed as `readonly unknown[]` so callers can pass
 * union arrays (e.g. `Warehouse[] | InventoryItem[]`) without TypeScript
 * complaining. The return type is the same shape as the input.
 */
export function paginate<T>(arr: readonly T[] | null | undefined, page: number, pageSize: number): T[] {
  const safe = Array.isArray(arr) ? (arr as readonly T[]) : [];
  const safePage = Math.max(1, Math.min(page || 1, Math.max(1, Math.ceil(safe.length / pageSize) || 1)));
  const start = (safePage - 1) * pageSize;
  return safe.slice(start, start + pageSize) as T[];
}

