import { describe, expect, it } from "vitest";
import {
  calculateNepalShippingQuote,
  classifyNepalDistrict,
  computeCodBatchVariance,
  type ShippingZoneConfig,
} from "@/features/shipping/nepal-shipping-calculator";

describe("Nepal Shipping Zones & COD Reconciliation", () => {
  const sampleZones: ShippingZoneConfig[] = [
    {
      id: "z-valley",
      name: "Kathmandu Valley",
      zone_code: "inside_valley",
      districts: ["Kathmandu", "Lalitpur", "Bhaktapur"],
      rates: [
        {
          id: "r-1",
          label: "Same/Next Day Valley",
          flat_fee_minor: 10_000, // NPR 100
          free_shipping_min_order_minor: 300_000, // NPR 3,000
          estimated_days_min: 1,
          estimated_days_max: 2,
          cod_allowed: true,
          is_active: true,
        },
      ],
    },
    {
      id: "z-outside",
      name: "Outside Valley Major Cities",
      zone_code: "outside_valley",
      districts: ["Kaski", "Chitwan", "Morang"],
      rates: [
        {
          id: "r-2",
          label: "NCM / Pathao National",
          flat_fee_minor: 18_000, // NPR 180
          free_shipping_min_order_minor: 500_000, // NPR 5,000
          estimated_days_min: 2,
          estimated_days_max: 4,
          cod_allowed: true,
          is_active: true,
        },
      ],
    },
  ];

  it("classifies Nepal districts accurately across Valley, Major Cities, and Remote", () => {
    expect(classifyNepalDistrict("Lalitpur")).toBe("inside_valley");
    expect(classifyNepalDistrict("Pokhara")).toBe("outside_valley");
    expect(classifyNepalDistrict("Mustang")).toBe("remote_district");
  });

  it("applies flat fee below free-shipping threshold and waives fee at/above threshold", () => {
    const paidQuote = calculateNepalShippingQuote({
      district: "Kathmandu",
      subtotalMinor: 150_000,
      configuredZones: sampleZones,
    });
    expect(paidQuote.feeMinor).toBe(10_000);
    expect(paidQuote.freeShippingApplied).toBe(false);

    const freeQuote = calculateNepalShippingQuote({
      district: "Kathmandu",
      subtotalMinor: 350_000,
      configuredZones: sampleZones,
    });
    expect(freeQuote.feeMinor).toBe(0);
    expect(freeQuote.freeShippingApplied).toBe(true);
  });

  it("computes exact COD batch variance in paisa", () => {
    expect(
      computeCodBatchVariance({
        expectedTotalMinor: 450_000,
        remittedTotalMinor: 450_000,
      })
    ).toEqual({
      expectedTotalMinor: 450_000,
      remittedTotalMinor: 450_000,
      varianceMinor: 0,
      isBalanced: true,
    });

    expect(
      computeCodBatchVariance({
        expectedTotalMinor: 450_000,
        remittedTotalMinor: 435_000,
      }).varianceMinor
    ).toBe(-15_000);
  });
});
