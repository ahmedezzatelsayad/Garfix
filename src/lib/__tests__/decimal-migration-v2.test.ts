import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { addMoney, subtractMoney, multiplyMoney, divideMoney, roundMoney, formatMoney, isZero, calculatePercentage } from '@/lib/money';

describe('Decimal Migration — Money Utilities', () => {
  it('addMoney avoids floating-point errors: 0.1 + 0.2 = 0.30', () => {
    const result = addMoney(0.1, 0.2);
    expect(result.toFixed(2)).toBe('0.30');
  });

  it('subtractMoney works correctly', () => {
    const result = subtractMoney(100, 33.33);
    expect(roundMoney(result).toFixed(2)).toBe('66.67');
  });

  it('multiplyMoney calculates tax correctly', () => {
    const result = multiplyMoney(150, 0.15);
    expect(roundMoney(result).toFixed(2)).toBe('22.50');
  });

  it('divideMoney splits amounts', () => {
    const result = divideMoney(100, 3);
    expect(roundMoney(result).toFixed(2)).toBe('33.33');
  });

  it('roundMoney rounds to 2 decimal places', () => {
    expect(roundMoney(123.456).toFixed(2)).toBe('123.46');
    expect(roundMoney(123.454).toFixed(2)).toBe('123.45');
  });

  it('formatMoney formats with currency', () => {
    expect(formatMoney(1234.56, 'SAR')).toBe('1234.56 SAR');
    expect(formatMoney(0, 'KWD')).toBe('0.00 KWD');
  });

  it('isZero detects zero values', () => {
    expect(isZero(0)).toBe(true);
    expect(isZero(0.00)).toBe(true);
    expect(isZero(0.01)).toBe(false);
  });

  it('calculatePercentage handles edge cases', () => {
    expect(calculatePercentage(25, 100).toFixed(2)).toBe('25.00');
    expect(calculatePercentage(0, 100).toFixed(2)).toBe('0.00');
    expect(calculatePercentage(50, 0).toFixed(2)).toBe('0.00'); // division by zero returns 0
  });

  it('Decimal preserves precision for large amounts', () => {
    const largeAmount = addMoney('999999999.99', '0.01');
    expect(largeAmount.toFixed(2)).toBe('1000000000.00');
  });
});
