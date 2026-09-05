import { describe, it, expect } from 'vitest';
import {
  toDecimal,
  decAdd,
  decSub,
  decMul,
  decDiv,
  decMax,
  decMin,
  decClamp,
  applyRounding,
  formatVnd,
} from '../decimal-math';

describe('PHASE 14 — DECIMAL MATH UTILITY TESTS', () => {
  it('solves classic floating point issues with exact precision (0.1 + 0.2 === 0.3)', () => {
    // Standard JS float fails: 0.1 + 0.2 = 0.30000000000000004
    const res = decAdd(0.1, 0.2);
    expect(res.toString()).toBe('0.3');
  });

  it('handles addition and subtraction with large monetary numbers accurately', () => {
    const salary = '50000000.55';
    const bonus = '15000000.45';
    const penalty = '2000000';

    const gross = decAdd(salary, bonus);
    expect(gross.toString()).toBe('65000001');

    const net = decSub(gross, penalty);
    expect(net.toString()).toBe('63000001');
  });

  it('handles multiplication and percentage fractions safely without floating drift', () => {
    const base = '46800000';
    const rate = '0.08'; // 8% social insurance
    const insurance = decMul(base, rate);
    expect(insurance.toString()).toBe('3744000');
  });

  it('safely handles division and avoids division by zero crashes', () => {
    expect(decDiv(1000, 2).toString()).toBe('500');
    expect(decDiv(1000, 0).toString()).toBe('0');
    expect(decDiv(1000, '0').toString()).toBe('0');
  });

  it('correctly clamps and selects max/min values', () => {
    expect(decMax(10, 20).toString()).toBe('20');
    expect(decMin(10, 20).toString()).toBe('10');
    expect(decClamp(5, 10, 20).toString()).toBe('10');
    expect(decClamp(25, 10, 20).toString()).toBe('20');
    expect(decClamp(15, 10, 20).toString()).toBe('15');
  });

  describe('applyRounding', () => {
    it('applies ROUND_HALF_UP correctly to nearest 1,000 VND', () => {
      expect(applyRounding('1234500', 'ROUND_HALF_UP', 1000).toString()).toBe('1235000');
      expect(applyRounding('1234499', 'ROUND_HALF_UP', 1000).toString()).toBe('1234000');
    });

    it('applies FLOOR correctly to nearest 1,000 VND', () => {
      expect(applyRounding('1234999', 'FLOOR', 1000).toString()).toBe('1234000');
    });

    it('applies CEIL correctly to nearest 1,000 VND', () => {
      expect(applyRounding('1234001', 'CEIL', 1000).toString()).toBe('1235000');
    });

    it('applies ROUND_HALF_UP correctly to nearest 100 VND', () => {
      expect(applyRounding('12550', 'ROUND_HALF_UP', 100).toString()).toBe('12600');
      expect(applyRounding('12549', 'ROUND_HALF_UP', 100).toString()).toBe('12500');
    });
  });

  it('formats currency correctly in VND format', () => {
    const formatted = formatVnd('12500000');
    expect(formatted).toContain('12.500.000');
    expect(formatted).toContain('₫');
  });
});
