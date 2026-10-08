/** Bridge wire amounts are decimal integer micro-USD strings, never floats. */
const MICROS_PER_CENT = 10_000n;
const HALF_CENT = MICROS_PER_CENT / 2n;
const MIN_LEDGER_CENTS = -2_147_483_648n;
const MAX_LEDGER_CENTS = 2_147_483_647n;

function parseMicros(value: string): bigint {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value) || value === "-0") {
    throw new RangeError("USD micros must be a canonical decimal integer string");
  }
  return BigInt(value);
}

/**
 * Apply an incremental billed amount, including a sourced negative correction.
 * Persist both results atomically with the cost event, under the same binding /
 * UTC month lock. Never apply this function to subscription reference values.
 * Half cents round toward positive infinity; residual is in [-5000, 5000).
 */
export function settleUsdMicros(residualMicros: string, billedMicros: string): {
  costCents: number;
  residualMicros: string;
} {
  const residual = parseMicros(residualMicros);
  if (residual < -HALF_CENT || residual >= HALF_CENT) {
    throw new RangeError("USD micros residual is outside the accounting interval");
  }
  const total = residual + parseMicros(billedMicros);
  const shifted = total + HALF_CENT;
  // BigInt division truncates toward zero; accounting requires floor division.
  let cents = shifted / MICROS_PER_CENT;
  if (shifted < 0n && shifted % MICROS_PER_CENT !== 0n) cents -= 1n;
  if (cents < MIN_LEDGER_CENTS || cents > MAX_LEDGER_CENTS) {
    throw new RangeError("Cost delta exceeds the native integer-cent ledger range");
  }
  return { costCents: Number(cents), residualMicros: (total - cents * MICROS_PER_CENT).toString() };
}

/** Event occurrence time determines the window even when import arrives later. */
export function utcAccountingMonth(occurredAt: Date): string {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new RangeError("Accounting occurrence time must be a valid Date");
  }
  const year = occurredAt.getUTCFullYear();
  if (year < 1 || year > 9999) throw new RangeError("Accounting year must be between 1 and 9999");
  return `${String(year).padStart(4, "0")}-${String(occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
}
