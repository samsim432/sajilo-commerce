
/**
 * Converts major NPR units to integer minor units (paisa).
 * Example: 1499 -> 149900.
 *
 * Rounds to the nearest paisa to avoid floating-point drift.
 */
export function nprToPaisa(nprAmount: number): number {
  if (!Number.isFinite(nprAmount)) {
    return 0;
  }

  return Math.round(nprAmount * 100);
}

/**
 * Converts an NPR string or number to integer paisa.
 *
 * Returns null for invalid, empty, or negative values.
 * Examples:
 * "1499"   -> 149900
 * "1499.5" -> 149950
 * "1499.99" -> 149999
 */
export function nprToMinor(value: string | number): number | null {
  const raw = String(value).trim();

  if (!raw || !/^\d+(?:\.\d{0,2})?$/.test(raw)) {
    return null;
  }

  const amount = Number(raw);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return nprToPaisa(amount);
}

/**
 * Converts integer minor units (paisa) to major NPR.
 * Example: 149900 -> 1499.
 */
export function paisaToNpr(paisa: number): number {
  return paisa / 100;
}

/**
 * Formats integer paisa as an NPR display string.
 */
export function formatNpr(
  paisa: number,
  options?: { showDecimals?: boolean; compact?: boolean }
): string {
  const npr = paisa / 100;
  const isWhole = Math.abs(paisa % 100) === 0;
  const useDecimals = options?.showDecimals ?? !isWhole;

  if (options?.compact && Math.abs(npr) >= 1000) {
    const formattedCompact = new Intl.NumberFormat("en-NP", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(npr);

    return `NPR ${formattedCompact}`;
  }

  const formatted = new Intl.NumberFormat("en-NP", {
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  }).format(npr);

  return `NPR ${formatted}`;
}

/**
 * Normalizes common Nepali phone formats into canonical +97798XXXXXXXX
 * or +97797XXXXXXXX.
 *
 * Returns null if the input does not match a valid 10-digit
 * Nepali mobile number.
 */
export function normalizeNepalPhone(rawInput: string): string | null {
  const digitsOnly = rawInput.replace(/\D/g, "");

  let tenDigitLocal: string | null = null;

  if (digitsOnly.length === 10) {
    tenDigitLocal = digitsOnly;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    tenDigitLocal = digitsOnly.slice(1);
  } else if (digitsOnly.length === 13 && digitsOnly.startsWith("977")) {
    tenDigitLocal = digitsOnly.slice(3);
  }

  if (!tenDigitLocal || !/^9[78]\d{8}$/.test(tenDigitLocal)) {
    return null;
  }

  return `+977${tenDigitLocal}`;
}
