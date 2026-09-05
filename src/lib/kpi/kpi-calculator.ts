/**
 * PHASE 11 — KPI CALCULATION ENGINE
 * 
 * Pure, deterministic mathematical evaluation for:
 * 1. Achievement rate (%) based on calculation type (HIGHER_IS_BETTER, LOWER_IS_BETTER, MILESTONE)
 * 2. Performance bonus amount based on policy (LINEAR, TIERED, ACCELERATOR, THRESHOLD_ONLY)
 * 3. Weighted multi-KPI scorecard aggregation
 * 4. Formatting and rating classification helpers
 * 
 * NOTE: This module contains NO UI dependencies and NO database side-effects.
 * It is consumed by both backend services (evaluations) and frontend components (live preview).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CalculationType = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'MILESTONE';

export type BonusFormula = 'LINEAR' | 'TIERED' | 'ACCELERATOR' | 'THRESHOLD_ONLY';

export type KpiUnit = 'PERCENT' | 'VND' | 'TASKS' | 'HOURS' | 'POINTS' | 'CONTRACTS';

export type KpiPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type AchievementTier = 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'UNSATISFACTORY';

export interface AchievementRateOptions {
  minRate?: number; // default 0%
  maxRate?: number; // default 200%
}

export interface BonusCalculationOptions {
  minLinearThreshold?: number; // default 80%
  acceleratorMultiplier?: number; // default 1.5x
}

export interface KpiScorecardItemInput {
  id?: string;
  code?: string;
  title?: string;
  targetValue: number;
  actualValue?: number | null;
  unit?: string;
  weight?: number;
  calculationType?: CalculationType;
  baseBonusAmount?: number;
  bonusFormula?: BonusFormula;
}

export interface EvaluatedKpiItem {
  id?: string;
  code?: string;
  title?: string;
  targetValue: number;
  actualValue: number;
  unit: string;
  weight: number;
  calculationType: CalculationType;
  baseBonusAmount: number;
  bonusFormula: BonusFormula;
  achievementRate: number;
  score: number;
  weightedScore: number;
  bonusAmount: number;
  tier: {
    tier: AchievementTier;
    label: string;
    color: string;
    badgeClass: string;
  };
}

export interface KpiScorecardSummary {
  items: EvaluatedKpiItem[];
  totalWeight: number;
  weightedAverageScore: number;
  totalBonusEarned: number;
  totalBaseBonusPotential: number;
  completedKpiCount: number;
  totalKpiCount: number;
  overallTier: {
    tier: AchievementTier;
    label: string;
    color: string;
    badgeClass: string;
  };
}

// ── Pure Calculation Functions ───────────────────────────────────────────────

/**
 * Calculates achievement rate percentage from actual and target values.
 *
 * @param actual - Actual value achieved
 * @param target - Target value set
 * @param calculationType - HIGHER_IS_BETTER, LOWER_IS_BETTER, or MILESTONE
 * @param options - Min / Max capping bounds
 * @returns Rate as a percentage (e.g. 115.5 for 115.5%)
 */
export function calculateAchievementRate(
  actual: number,
  target: number,
  calculationType: CalculationType = 'HIGHER_IS_BETTER',
  options?: AchievementRateOptions
): number {
  const minRate = options?.minRate ?? 0;
  const maxRate = options?.maxRate ?? 200;

  if (isNaN(actual) || isNaN(target)) {
    return 0;
  }

  let rate = 0;

  switch (calculationType) {
    case 'HIGHER_IS_BETTER': {
      // Examples: Revenue, completed tasks, customer NPS
      if (target <= 0) {
        rate = actual >= 0 ? 100 : 0;
      } else {
        rate = (actual / target) * 100;
      }
      break;
    }

    case 'LOWER_IS_BETTER': {
      // Examples: Bug count, response time, customer complaints, cost
      if (target <= 0) {
        rate = actual <= 0 ? 100 : 0;
      } else if (actual <= target) {
        // Exceeded expectations by keeping below target
        rate = 100 + ((target - actual) / target) * 100;
      } else {
        // Underperformed by exceeding target
        const diff = actual - target;
        rate = Math.max(0, 100 - (diff / target) * 100);
      }
      break;
    }

    case 'MILESTONE': {
      // Binary milestone completion
      rate = actual >= target ? 100 : 0;
      break;
    }

    default:
      rate = 0;
  }

  // Apply bounds
  const clampedRate = Math.min(Math.max(rate, minRate), maxRate);

  // Round to 2 decimal places
  return Math.round(clampedRate * 100) / 100;
}

/**
 * Calculates performance bonus amount in currency based on policy formula.
 *
 * @param achievementRate - Achievement percentage (e.g. 120 for 120%)
 * @param baseBonusAmount - Baseline bonus pool for 100% achievement (e.g. 5,000,000 VND)
 * @param bonusFormula - LINEAR, TIERED, ACCELERATOR, or THRESHOLD_ONLY
 * @param options - Configurable threshold and accelerator multipliers
 * @returns Calculated bonus amount (integer rounded)
 */
export function calculateBonusAmount(
  achievementRate: number,
  baseBonusAmount: number,
  bonusFormula: BonusFormula = 'TIERED',
  options?: BonusCalculationOptions
): number {
  if (baseBonusAmount <= 0 || achievementRate <= 0 || isNaN(achievementRate) || isNaN(baseBonusAmount)) {
    return 0;
  }

  const minLinearThreshold = options?.minLinearThreshold ?? 80;
  const acceleratorMultiplier = options?.acceleratorMultiplier ?? 1.5;

  let bonus = 0;

  switch (bonusFormula) {
    case 'LINEAR': {
      // Linear proportional with a minimum achievement gate
      if (achievementRate < minLinearThreshold) {
        bonus = 0;
      } else {
        bonus = baseBonusAmount * (achievementRate / 100);
      }
      break;
    }

    case 'TIERED': {
      // Step-ladder tiered bonus policy:
      // < 70%       -> 0%
      // 70% - 79.9% -> 50% base bonus
      // 80% - 99.9% -> 80% base bonus
      // 100% - 119% -> 100% base bonus
      // >= 120%     -> 130% base bonus
      if (achievementRate < 70) {
        bonus = 0;
      } else if (achievementRate < 80) {
        bonus = baseBonusAmount * 0.5;
      } else if (achievementRate < 100) {
        bonus = baseBonusAmount * 0.8;
      } else if (achievementRate < 120) {
        bonus = baseBonusAmount * 1.0;
      } else {
        bonus = baseBonusAmount * 1.3;
      }
      break;
    }

    case 'ACCELERATOR': {
      // Progressive accelerator above 100%:
      // < 80%     -> 0%
      // 80% - 100%-> Linear (achievementRate / 100)
      // > 100%    -> 100% base + excess% * multiplier (1.5x default)
      if (achievementRate < 80) {
        bonus = 0;
      } else if (achievementRate <= 100) {
        bonus = baseBonusAmount * (achievementRate / 100);
      } else {
        const excess = achievementRate - 100;
        const acceleratorPart = baseBonusAmount * (excess / 100) * acceleratorMultiplier;
        bonus = baseBonusAmount + acceleratorPart;
      }
      break;
    }

    case 'THRESHOLD_ONLY': {
      // All-or-nothing threshold bonus
      bonus = achievementRate >= 100 ? baseBonusAmount : 0;
      break;
    }

    default:
      bonus = 0;
  }

  return Math.round(bonus);
}

/**
 * Calculates a complete aggregated scorecard across multiple assigned KPIs.
 */
export function calculateOverallKpiScorecard(
  items: KpiScorecardItemInput[],
  options?: { minRate?: number; maxRate?: number; minLinearThreshold?: number; acceleratorMultiplier?: number }
): KpiScorecardSummary {
  let totalWeight = 0;
  let weightedScoreSum = 0;
  let totalBonusEarned = 0;
  let totalBaseBonusPotential = 0;
  let completedKpiCount = 0;

  const evaluatedItems: EvaluatedKpiItem[] = [];

  for (const item of items) {
    const weight = item.weight && item.weight > 0 ? Number(item.weight) : 1;
    const calcType = item.calculationType || 'HIGHER_IS_BETTER';
    const bonusForm = item.bonusFormula || 'TIERED';
    const baseBonus = Number(item.baseBonusAmount) || 0;
    const actual = item.actualValue != null ? Number(item.actualValue) : 0;
    const target = Number(item.targetValue) || 1;
    const isEvaluated = item.actualValue != null;

    if (isEvaluated) {
      completedKpiCount++;
    }

    const achievementRate = calculateAchievementRate(actual, target, calcType, options);
    const bonusAmount = calculateBonusAmount(achievementRate, baseBonus, bonusForm, options);
    const score = achievementRate;
    const weightedScore = Math.round(((score * weight) / 100) * 100) / 100;

    totalWeight += weight;
    weightedScoreSum += score * weight;
    totalBonusEarned += bonusAmount;
    totalBaseBonusPotential += baseBonus;

    evaluatedItems.push({
      id: item.id,
      code: item.code,
      title: item.title,
      targetValue: target,
      actualValue: actual,
      unit: item.unit || 'PERCENT',
      weight,
      calculationType: calcType,
      baseBonusAmount: baseBonus,
      bonusFormula: bonusForm,
      achievementRate,
      score,
      weightedScore,
      bonusAmount,
      tier: getAchievementTier(achievementRate),
    });
  }

  const weightedAverageScore =
    totalWeight > 0 ? Math.round((weightedScoreSum / totalWeight) * 100) / 100 : 0;

  return {
    items: evaluatedItems,
    totalWeight,
    weightedAverageScore,
    totalBonusEarned,
    totalBaseBonusPotential,
    completedKpiCount,
    totalKpiCount: items.length,
    overallTier: getAchievementTier(weightedAverageScore),
  };
}

// ── Rating Classification & Formatting Helpers ──────────────────────────────

/**
 * Returns performance classification tier, label, and UI badge styles.
 */
export function getAchievementTier(achievementRate: number): {
  tier: AchievementTier;
  label: string;
  color: string;
  badgeClass: string;
} {
  if (achievementRate >= 120) {
    return {
      tier: 'EXCELLENT',
      label: 'Xuất Sắc (>=120%)',
      color: '#10B981', // emerald
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    };
  }
  if (achievementRate >= 100) {
    return {
      tier: 'GOOD',
      label: 'Đạt Mục Tiêu (100–119%)',
      color: '#3B82F6', // blue
      badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    };
  }
  if (achievementRate >= 80) {
    return {
      tier: 'NEEDS_IMPROVEMENT',
      label: 'Cần Cố Gắng (80–99%)',
      color: '#F59E0B', // amber
      badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    };
  }
  return {
    tier: 'UNSATISFACTORY',
    label: 'Chưa Đạt (<80%)',
    color: '#EF4444', // red
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
}

/**
 * Formats a KPI metric value with its unit.
 */
export function formatKpiUnit(value: number, unit: string = 'PERCENT'): string {
  if (isNaN(value)) return '0';

  switch (unit.toUpperCase()) {
    case 'VND':
      return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
    case 'PERCENT':
      return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
    case 'TASKS':
      return `${new Intl.NumberFormat('vi-VN').format(value)} công việc`;
    case 'HOURS':
      return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
    case 'POINTS':
      return `${new Intl.NumberFormat('vi-VN').format(value)} điểm`;
    case 'CONTRACTS':
      return `${new Intl.NumberFormat('vi-VN').format(value)} hợp đồng`;
    default:
      return `${new Intl.NumberFormat('vi-VN').format(value)} ${unit}`;
  }
}

/**
 * Formats bonus currency in VND.
 */
export function formatBonusVnd(amount: number): string {
  if (isNaN(amount) || amount <= 0) return '0 ₫';
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}
