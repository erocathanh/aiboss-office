import { formatUsdExact, unitsToCents, MAX_MONEY_UNITS } from './money';

/**
 * Format exact nanodollars to USD string (e.g. 733263400n -> "$0.73").
 * Safe against arbitrary inputs, null/undefined, and values exceeding MAX_MONEY_UNITS.
 * Never throws in UI render or backend logging.
 */
export function formatNanodollars(units: bigint | string | number | null | undefined): string {
  if (units === null || units === undefined) {
    return '$0.00';
  }
  try {
    const text = typeof units === 'string' ? units.trim() : String(units);
    if (!text || text === 'null' || text === 'undefined') return '$0.00';
    const b = typeof units === 'bigint' ? units : BigInt(text);
    if (b > MAX_MONEY_UNITS || b < -MAX_MONEY_UNITS) {
      return '$---';
    }
    return formatUsdExact(unitsToCents(b));
  } catch {
    return '$0.00';
  }
}
