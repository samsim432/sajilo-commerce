export const KATHMANDU_VALLEY_DISTRICTS = [
  "kathmandu",
  "lalitpur",
  "bhaktapur",
] as const;

export const MAJOR_OUTSIDE_VALLEY_DISTRICTS = [
  "kaski",
  "pokhara",
  "chitwan",
  "bharatpur",
  "morang",
  "biratnagar",
  "sunsari",
  "dharan",
  "itahari",
  "rupandehi",
  "butwal",
  "bhairahawa",
  "jhapa",
  "birtamod",
  "makwanpur",
  "hetauda",
  "banke",
  "nepalgunj",
  "kailali",
  "dhangadhi",
  "dhanusha",
  "janakpur",
  "parsa",
  "birgunj",
] as const;

export interface ShippingZoneConfig {
  id: string;
  name: string;
  zone_code: "inside_valley" | "outside_valley" | "remote_district" | "custom";
  districts: string[];
  rates: Array<{
    id: string;
    label: string;
    flat_fee_minor: number;
    free_shipping_min_order_minor: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    cod_allowed: boolean;
    is_active: boolean;
  }>;
}

export interface ShippingQuote {
  zoneName: string;
  rateLabel: string;
  feeMinor: number;
  freeShippingApplied: boolean;
  codAllowed: boolean;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

export function classifyNepalDistrict(
  districtInput?: string | null
): "inside_valley" | "outside_valley" | "remote_district" {
  const norm = (districtInput ?? "").trim().toLowerCase();
  if (!norm) return "inside_valley";
  if ((KATHMANDU_VALLEY_DISTRICTS as readonly string[]).includes(norm)) {
    return "inside_valley";
  }
  if ((MAJOR_OUTSIDE_VALLEY_DISTRICTS as readonly string[]).includes(norm)) {
    return "outside_valley";
  }
  return "remote_district";
}

export function calculateNepalShippingQuote(params: {
  district?: string | null;
  subtotalMinor: number;
  configuredZones: ShippingZoneConfig[];
}): ShippingQuote {
  const normDistrict = (params.district ?? "").trim().toLowerCase();

  // 1. Match explicit district list in merchant-configured zones first
  let matchedZone = params.configuredZones.find((z) =>
    z.districts.some((d) => d.trim().toLowerCase() === normDistrict && normDistrict.length > 0)
  );

  // 2. Fall back to classified zone_code
  if (!matchedZone) {
    const inferredCode = classifyNepalDistrict(params.district);
    matchedZone =
      params.configuredZones.find((z) => z.zone_code === inferredCode) ??
      params.configuredZones[0];
  }

  if (matchedZone) {
    const activeRate = matchedZone.rates.find((r) => r.is_active) ?? matchedZone.rates[0];
    if (activeRate) {
      const qualifiesFree =
        activeRate.free_shipping_min_order_minor !== null &&
        params.subtotalMinor >= activeRate.free_shipping_min_order_minor;

      return {
        zoneName: matchedZone.name,
        rateLabel: activeRate.label,
        feeMinor: qualifiesFree ? 0 : Number(activeRate.flat_fee_minor),
        freeShippingApplied: qualifiesFree,
        codAllowed: activeRate.cod_allowed,
        estimatedDaysMin: activeRate.estimated_days_min,
        estimatedDaysMax: activeRate.estimated_days_max,
      };
    }
  }

  // Sensible Nepal default fallback (NPR 100 inside valley, NPR 180 outside valley)
  const inferred = classifyNepalDistrict(params.district);
  const defaultFeeMinor = inferred === "inside_valley" ? 10_000 : 18_000;
  return {
    zoneName:
      inferred === "inside_valley"
        ? "Kathmandu Valley"
        : inferred === "outside_valley"
          ? "Outside Valley Major Cities"
          : "Rest of Nepal",
    rateLabel: "Standard Delivery",
    feeMinor: defaultFeeMinor,
    freeShippingApplied: false,
    codAllowed: true,
    estimatedDaysMin: inferred === "inside_valley" ? 1 : 2,
    estimatedDaysMax: inferred === "inside_valley" ? 2 : 5,
  };
}

export function computeCodBatchVariance(params: {
  expectedTotalMinor: number;
  remittedTotalMinor: number;
}) {
  const varianceMinor = params.remittedTotalMinor - params.expectedTotalMinor;
  return {
    expectedTotalMinor: params.expectedTotalMinor,
    remittedTotalMinor: params.remittedTotalMinor,
    varianceMinor,
    isBalanced: varianceMinor === 0,
  };
}
