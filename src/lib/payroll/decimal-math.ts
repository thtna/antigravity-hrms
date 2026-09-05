import Decimal from 'decimal.js';

// Configure Decimal globally for high financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -14,
  toExpPos: 28,
});

export { Decimal };

export type RoundingMethod = 'ROUND_HALF_UP' | 'FLOOR' | 'CEIL' | 'TRUNCATE';

/**
 * Safely converts any numeric, string, or Decimal representation to Decimal.
 * Defaults to 0 if input is null, undefined, or empty.
 */
export function toDecimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  if (value instanceof Decimal) {
    return value;
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Decimal addition: a + b
 */
export function decAdd(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

/**
 * Decimal subtraction: a - b
 */
export function decSub(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

/**
 * Decimal multiplication: a * b
 */
export function decMul(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  return toDecimal(a).times(toDecimal(b));
}

/**
 * Decimal division: a / b
 * Returns 0 if denominator is 0 to avoid division by zero crashes.
 */
export function decDiv(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  const denom = toDecimal(b);
  if (denom.isZero()) {
    return new Decimal(0);
  }
  return toDecimal(a).dividedBy(denom);
}

/**
 * Returns the greater of two Decimals.
 */
export function decMax(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.greaterThan(decB) ? decA : decB;
}

/**
 * Returns the smaller of two Decimals.
 */
export function decMin(
  a: number | string | Decimal,
  b: number | string | Decimal
): Decimal {
  const decA = toDecimal(a);
  const decB = toDecimal(b);
  return decA.lessThan(decB) ? decA : decB;
}

/**
 * Clamps a Decimal value within [min, max].
 */
export function decClamp(
  val: number | string | Decimal,
  min?: number | string | Decimal,
  max?: number | string | Decimal
): Decimal {
  let res = toDecimal(val);
  if (min !== undefined) {
    res = decMax(res, min);
  }
  if (max !== undefined) {
    res = decMin(res, max);
  }
  return res;
}

/**
 * Applies configurable rounding rules:
 * - method: 'ROUND_HALF_UP' | 'FLOOR' | 'CEIL' | 'TRUNCATE'
 * - unit: 1 (nearest 1 VND), 100 (nearest 100 VND), 1000 (nearest 1,000 VND), or 0.01 (cents)
 */
export function applyRounding(
  value: number | string | Decimal,
  method: RoundingMethod = 'ROUND_HALF_UP',
  unit: number = 1
): Decimal {
  const val = toDecimal(value);
  if (unit <= 0) unit = 1;

  const unitDec = new Decimal(unit);
  const scaled = val.dividedBy(unitDec);

  let roundedScaled: Decimal;
  switch (method) {
    case 'FLOOR':
      roundedScaled = scaled.floor();
      break;
    case 'CEIL':
      roundedScaled = scaled.ceil();
      break;
    case 'TRUNCATE':
      roundedScaled = scaled.truncated();
      break;
    case 'ROUND_HALF_UP':
    default:
      roundedScaled = scaled.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      break;
  }

  return roundedScaled.times(unitDec);
}

/**
 * Formats a Decimal value as an exact VND currency string: e.g. "12,500,000 ₫"
 */
export function formatVnd(value: number | string | Decimal): string {
  const rounded = applyRounding(value, 'ROUND_HALF_UP', 1);
  const num = rounded.toNumber();
  return `${new Intl.NumberFormat('vi-VN').format(num)} ₫`;
}
