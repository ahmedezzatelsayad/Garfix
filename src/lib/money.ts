/**
 * Money utilities for the GarfiX accounting module.
 * Provides safe numeric operations for financial calculations.
 */

/**
 * Convert a value to a safe number for financial calculations.
 * Handles null, undefined, NaN, and string inputs.
 * Returns 0 for any invalid input.
 */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    if (isNaN(value)) return 0
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) return 0
    return parsed
  }
  // Handle Prisma Decimal or other numeric-like objects
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = parseFloat(String(value))
    if (isNaN(parsed)) return 0
    return parsed
  }
  return 0
}

/**
 * Safely add two financial values.
 */
export function add(a: unknown, b: unknown): number {
  return num(a) + num(b)
}

/**
 * Safely subtract two financial values.
 */
export function subtract(a: unknown, b: unknown): number {
  return num(a) - num(b)
}

/**
 * Safely multiply two financial values.
 */
export function multiply(a: unknown, b: unknown): number {
  return num(a) * num(b)
}

/**
 * Safely divide two financial values. Returns 0 if divisor is 0.
 */
export function divide(a: unknown, b: unknown): number {
  const divisor = num(b)
  if (divisor === 0) return 0
  return num(a) / divisor
}

/**
 * Round a number to the specified decimal places (default 2 for currency).
 */
export function round(value: unknown, decimals: number = 2): number {
  const n = num(value)
  const factor = Math.pow(10, decimals)
  return Math.round(n * factor) / factor
}

/**
 * Format a number as a currency string.
 */
export function formatCurrency(value: unknown, currency: string = 'USD', decimals: number = 2): string {
  const n = round(value, decimals)
  return `${currency} ${n.toFixed(decimals)}`
}

/**
 * Sum an array of values safely.
 */
export function sum(values: unknown[]): number {
  return values.reduce((acc, v) => acc + num(v), 0)
}
