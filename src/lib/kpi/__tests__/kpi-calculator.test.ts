import { describe, it, expect } from 'vitest';
import {
  calculateAchievementRate,
  calculateBonusAmount,
  calculateOverallKpiScorecard,
  getAchievementTier,
  formatKpiUnit,
  formatBonusVnd,
} from '../kpi-calculator';

describe('PHASE 11 — KPI Engine: kpi-calculator', () => {
  // ── 1. calculateAchievementRate ──────────────────────────────────────────

  describe('1. calculateAchievementRate — HIGHER_IS_BETTER', () => {
    it('returns 100% when actual equals target', () => {
      expect(calculateAchievementRate(100, 100, 'HIGHER_IS_BETTER')).toBe(100);
      expect(calculateAchievementRate(50_000_000, 50_000_000, 'HIGHER_IS_BETTER')).toBe(100);
    });

    it('returns 150% when actual exceeds target by 50%', () => {
      expect(calculateAchievementRate(150, 100, 'HIGHER_IS_BETTER')).toBe(150);
    });

    it('returns 60% when actual is below target', () => {
      expect(calculateAchievementRate(60, 100, 'HIGHER_IS_BETTER')).toBe(60);
    });

    it('handles target = 0 gracefully', () => {
      expect(calculateAchievementRate(10, 0, 'HIGHER_IS_BETTER')).toBe(100);
      expect(calculateAchievementRate(-5, 0, 'HIGHER_IS_BETTER')).toBe(0);
    });

    it('handles NaN or invalid numbers', () => {
      expect(calculateAchievementRate(NaN, 100, 'HIGHER_IS_BETTER')).toBe(0);
      expect(calculateAchievementRate(100, NaN, 'HIGHER_IS_BETTER')).toBe(0);
    });

    it('respects maxRate and minRate options', () => {
      expect(calculateAchievementRate(300, 100, 'HIGHER_IS_BETTER', { maxRate: 150 })).toBe(150);
      expect(calculateAchievementRate(10, 100, 'HIGHER_IS_BETTER', { minRate: 20 })).toBe(20);
    });
  });

  describe('2. calculateAchievementRate — LOWER_IS_BETTER', () => {
    it('returns 100% when actual equals target', () => {
      expect(calculateAchievementRate(10, 10, 'LOWER_IS_BETTER')).toBe(100);
    });

    it('awards bonus rate (>100%) when actual is lower than target', () => {
      // Target = 10 bugs, actual = 5 bugs -> 100 + ((10-5)/10)*100 = 150%
      expect(calculateAchievementRate(5, 10, 'LOWER_IS_BETTER')).toBe(150);
      // Target = 10, actual = 0 bugs -> 100 + (10/10)*100 = 200%
      expect(calculateAchievementRate(0, 10, 'LOWER_IS_BETTER')).toBe(200);
    });

    it('reduces rate (<100%) when actual exceeds target', () => {
      // Target = 10, actual = 15 bugs -> 100 - ((15-10)/10)*100 = 50%
      expect(calculateAchievementRate(15, 10, 'LOWER_IS_BETTER')).toBe(50);
      // Target = 10, actual = 20 bugs -> 100 - 100 = 0%
      expect(calculateAchievementRate(20, 10, 'LOWER_IS_BETTER')).toBe(0);
      // Target = 10, actual = 30 bugs -> clamped at minRate (0%)
      expect(calculateAchievementRate(30, 10, 'LOWER_IS_BETTER')).toBe(0);
    });

    it('handles target = 0', () => {
      expect(calculateAchievementRate(0, 0, 'LOWER_IS_BETTER')).toBe(100);
      expect(calculateAchievementRate(5, 0, 'LOWER_IS_BETTER')).toBe(0);
    });
  });

  describe('3. calculateAchievementRate — MILESTONE', () => {
    it('returns 100% when actual >= target', () => {
      expect(calculateAchievementRate(1, 1, 'MILESTONE')).toBe(100);
      expect(calculateAchievementRate(2, 1, 'MILESTONE')).toBe(100);
    });

    it('returns 0% when actual < target', () => {
      expect(calculateAchievementRate(0, 1, 'MILESTONE')).toBe(0);
    });
  });

  // ── 2. calculateBonusAmount ──────────────────────────────────────────────

  describe('4. calculateBonusAmount — LINEAR formula', () => {
    const baseBonus = 5_000_000;

    it('returns 0 when achievementRate is below min threshold (80%)', () => {
      expect(calculateBonusAmount(79.9, baseBonus, 'LINEAR')).toBe(0);
      expect(calculateBonusAmount(50, baseBonus, 'LINEAR')).toBe(0);
    });

    it('returns proportional bonus when achievementRate >= 80%', () => {
      expect(calculateBonusAmount(80, baseBonus, 'LINEAR')).toBe(4_000_000); // 80% of 5M
      expect(calculateBonusAmount(100, baseBonus, 'LINEAR')).toBe(5_000_000); // 100% of 5M
      expect(calculateBonusAmount(120, baseBonus, 'LINEAR')).toBe(6_000_000); // 120% of 5M
    });

    it('allows custom threshold', () => {
      expect(calculateBonusAmount(75, baseBonus, 'LINEAR', { minLinearThreshold: 70 })).toBe(3_750_000);
    });
  });

  describe('5. calculateBonusAmount — TIERED formula', () => {
    const baseBonus = 10_000_000;

    it('tier 1: < 70% -> 0', () => {
      expect(calculateBonusAmount(69.9, baseBonus, 'TIERED')).toBe(0);
    });

    it('tier 2: 70% - 79.9% -> 50% base bonus', () => {
      expect(calculateBonusAmount(70, baseBonus, 'TIERED')).toBe(5_000_000);
      expect(calculateBonusAmount(79.9, baseBonus, 'TIERED')).toBe(5_000_000);
    });

    it('tier 3: 80% - 99.9% -> 80% base bonus', () => {
      expect(calculateBonusAmount(80, baseBonus, 'TIERED')).toBe(8_000_000);
      expect(calculateBonusAmount(99.9, baseBonus, 'TIERED')).toBe(8_000_000);
    });

    it('tier 4: 100% - 119.9% -> 100% base bonus', () => {
      expect(calculateBonusAmount(100, baseBonus, 'TIERED')).toBe(10_000_000);
      expect(calculateBonusAmount(119.9, baseBonus, 'TIERED')).toBe(10_000_000);
    });

    it('tier 5: >= 120% -> 130% base bonus', () => {
      expect(calculateBonusAmount(120, baseBonus, 'TIERED')).toBe(13_000_000);
      expect(calculateBonusAmount(150, baseBonus, 'TIERED')).toBe(13_000_000);
    });
  });

  describe('6. calculateBonusAmount — ACCELERATOR formula', () => {
    const baseBonus = 4_000_000;

    it('returns 0 when < 80%', () => {
      expect(calculateBonusAmount(75, baseBonus, 'ACCELERATOR')).toBe(0);
    });

    it('returns linear bonus between 80% and 100%', () => {
      expect(calculateBonusAmount(80, baseBonus, 'ACCELERATOR')).toBe(3_200_000); // 80% of 4M
      expect(calculateBonusAmount(100, baseBonus, 'ACCELERATOR')).toBe(4_000_000); // 100% of 4M
    });

    it('accelerates above 100% with default 1.5x multiplier', () => {
      // 120%: base + base * 20% * 1.5 = 4M + 4M * 0.3 = 4M + 1.2M = 5.2M
      expect(calculateBonusAmount(120, baseBonus, 'ACCELERATOR')).toBe(5_200_000);
      // 140%: base + base * 40% * 1.5 = 4M + 4M * 0.6 = 4M + 2.4M = 6.4M
      expect(calculateBonusAmount(140, baseBonus, 'ACCELERATOR')).toBe(6_400_000);
    });

    it('supports custom accelerator multiplier', () => {
      // 120% with 2.0x multiplier: 4M + 4M * 0.2 * 2.0 = 4M + 1.6M = 5.6M
      expect(calculateBonusAmount(120, baseBonus, 'ACCELERATOR', { acceleratorMultiplier: 2.0 })).toBe(5_600_000);
    });
  });

  describe('7. calculateBonusAmount — THRESHOLD_ONLY formula', () => {
    const baseBonus = 3_000_000;

    it('returns 0 if achievement < 100%', () => {
      expect(calculateBonusAmount(99.9, baseBonus, 'THRESHOLD_ONLY')).toBe(0);
    });

    it('returns full base bonus if achievement >= 100%', () => {
      expect(calculateBonusAmount(100, baseBonus, 'THRESHOLD_ONLY')).toBe(3_000_000);
      expect(calculateBonusAmount(180, baseBonus, 'THRESHOLD_ONLY')).toBe(3_000_000);
    });

    it('handles 0 or negative base bonus', () => {
      expect(calculateBonusAmount(100, 0, 'THRESHOLD_ONLY')).toBe(0);
      expect(calculateBonusAmount(100, -1000, 'THRESHOLD_ONLY')).toBe(0);
    });
  });

  // ── 3. calculateOverallKpiScorecard ──────────────────────────────────────

  describe('8. calculateOverallKpiScorecard — Multi-KPI Aggregation', () => {
    it('calculates weighted average score and total bonus correctly', () => {
      const items = [
        {
          id: 'kpi-1',
          code: 'SALES_REV',
          title: 'Doanh Số Bán Hàng',
          targetValue: 100_000_000,
          actualValue: 120_000_000, // 120%
          weight: 50,
          baseBonusAmount: 5_000_000,
          calculationType: 'HIGHER_IS_BETTER' as const,
          bonusFormula: 'TIERED' as const, // 120% -> 130% = 6.5M
        },
        {
          id: 'kpi-2',
          code: 'NEW_CLIENTS',
          title: 'Khách Hàng Mới',
          targetValue: 10,
          actualValue: 10, // 100%
          weight: 30,
          baseBonusAmount: 3_000_000,
          calculationType: 'HIGHER_IS_BETTER' as const,
          bonusFormula: 'LINEAR' as const, // 100% -> 3.0M
        },
        {
          id: 'kpi-3',
          code: 'SLA_BUGS',
          title: 'Lỗi Chậm SLA',
          targetValue: 5,
          actualValue: 2, // 100 + ((5-2)/5)*100 = 160%
          weight: 20,
          baseBonusAmount: 2_000_000,
          calculationType: 'LOWER_IS_BETTER' as const,
          bonusFormula: 'THRESHOLD_ONLY' as const, // >=100% -> 2.0M
        },
      ];

      const scorecard = calculateOverallKpiScorecard(items);

      expect(scorecard.totalWeight).toBe(100);
      expect(scorecard.completedKpiCount).toBe(3);
      expect(scorecard.totalKpiCount).toBe(3);

      // Weighted score: (120 * 50 + 100 * 30 + 160 * 20) / 100 = (6000 + 3000 + 3200) / 100 = 122.00
      expect(scorecard.weightedAverageScore).toBe(122);
      expect(scorecard.overallTier.tier).toBe('EXCELLENT');

      // Total bonus: 6.5M + 3.0M + 2.0M = 11.5M
      expect(scorecard.totalBonusEarned).toBe(11_500_000);
      expect(scorecard.totalBaseBonusPotential).toBe(10_000_000);
    });

    it('handles empty items array', () => {
      const scorecard = calculateOverallKpiScorecard([]);
      expect(scorecard.totalWeight).toBe(0);
      expect(scorecard.weightedAverageScore).toBe(0);
      expect(scorecard.totalBonusEarned).toBe(0);
      expect(scorecard.totalKpiCount).toBe(0);
    });
  });

  // ── 4. Formatting and Tier Helpers ───────────────────────────────────────

  describe('9. Classification and Formatters', () => {
    it('classifies achievement tiers properly', () => {
      expect(getAchievementTier(130).tier).toBe('EXCELLENT');
      expect(getAchievementTier(105).tier).toBe('GOOD');
      expect(getAchievementTier(85).tier).toBe('NEEDS_IMPROVEMENT');
      expect(getAchievementTier(60).tier).toBe('UNSATISFACTORY');
    });

    it('formats KPI units correctly', () => {
      expect(formatKpiUnit(50_000_000, 'VND')).toContain('50.000.000');
      expect(formatKpiUnit(95.5, 'PERCENT')).toContain('95,5%');
      expect(formatKpiUnit(25, 'TASKS')).toContain('25 công việc');
      expect(formatKpiUnit(8.5, 'HOURS')).toContain('8,5 giờ');
    });

    it('formats VND bonus correctly', () => {
      expect(formatBonusVnd(5_000_000)).toContain('5.000.000 ₫');
      expect(formatBonusVnd(0)).toBe('0 ₫');
    });
  });
});
