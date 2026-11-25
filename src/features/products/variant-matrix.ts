import { z } from "zod";

export const optionAxisSchema = z.object({
  name: z.string().trim().min(1, "Option name is required").max(40),
  values: z
    .array(z.string().trim().min(1).max(40))
    .min(1, "Each option must have at least one value")
    .max(30),
});

export type OptionAxis = z.infer<typeof optionAxisSchema>;

export interface GeneratedVariantRow {
  title: string;
  sku: string;
  option_values: Record<string, string>;
  price_minor: number;
  compare_at_price_minor: number | null;
  cost_price_minor: number | null;
  weight_grams: number;
  low_stock_threshold: number;
  is_active: boolean;
  position: number;
}

export function slugifyProductTitle(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return clean.length >= 1 ? clean : `product-${Date.now()}`;
}

export function normalizeSkuSegment(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
}

export function buildSkuFromPrefix(
  skuPrefix: string,
  optionValues: Record<string, string>,
  fallbackIndex = 1
): string {
  const prefix = normalizeSkuSegment(skuPrefix) || "ITEM";
  const parts = Object.values(optionValues)
    .map((val) => normalizeSkuSegment(val))
    .filter(Boolean);

  if (parts.length === 0) {
    return `${prefix}-${String(fallbackIndex).padStart(2, "0")}`;
  }

  return `${prefix}-${parts.join("-")}`.slice(0, 64);
}

/**
 * Generates deterministic Cartesian variant combinations for up to 3 option axes.
 */
export function generateVariantMatrix(params: {
  axes: OptionAxis[];
  skuPrefix: string;
  defaultPriceMinor: number;
  defaultCostMinor?: number | null;
  defaultWeightGrams?: number;
}): GeneratedVariantRow[] {
  const validAxes = params.axes
    .slice(0, 3)
    .map((axis) => ({
      name: axis.name.trim(),
      values: Array.from(
        new Set(axis.values.map((v) => v.trim()).filter(Boolean))
      ),
    }))
    .filter((axis) => axis.name.length > 0 && axis.values.length > 0);

  if (validAxes.length === 0) {
    return [
      {
        title: "Default",
        sku: buildSkuFromPrefix(params.skuPrefix, {}, 1),
        option_values: {},
        price_minor: params.defaultPriceMinor,
        compare_at_price_minor: null,
        cost_price_minor: params.defaultCostMinor ?? null,
        weight_grams: params.defaultWeightGrams ?? 0,
        low_stock_threshold: 3,
        is_active: true,
        position: 0,
      },
    ];
  }

  let combinations: Array<Record<string, string>> = [{}];
  for (const axis of validAxes) {
    const next: Array<Record<string, string>> = [];
    for (const combo of combinations) {
      for (const val of axis.values) {
        next.push({ ...combo, [axis.name]: val });
      }
    }
    combinations = next;
  }

  return combinations.map((option_values, index) => {
    const title = Object.values(option_values).join(" / ");
    return {
      title,
      sku: buildSkuFromPrefix(params.skuPrefix, option_values, index + 1),
      option_values,
      price_minor: params.defaultPriceMinor,
      compare_at_price_minor: null,
      cost_price_minor: params.defaultCostMinor ?? null,
      weight_grams: params.defaultWeightGrams ?? 0,
      low_stock_threshold: 3,
      is_active: true,
      position: index,
    };
  });
}

export function findDuplicateSkus(skus: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of skus) {
    const normalized = raw.trim().toUpperCase();
    if (seen.has(normalized)) {
      duplicates.add(normalized);
    }
    seen.add(normalized);
  }
  return Array.from(duplicates);
}
