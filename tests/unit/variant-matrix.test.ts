import { describe, expect, it } from "vitest";
import {
  buildSkuFromPrefix,
  findDuplicateSkus,
  generateVariantMatrix,
} from "@/features/products/variant-matrix";

describe("3-axis variant matrix & SKU utilities", () => {
  it("generates full Cartesian combinations across 2 or 3 option axes", () => {
    const rows = generateVariantMatrix({
      axes: [
        { name: "Size", values: ["S", "M"] },
        { name: "Colour", values: ["Black", "Ivory", "Coral"] },
      ],
      skuPrefix: "KTM-HDY",
      defaultPriceMinor: 249900,
    });

    expect(rows).toHaveLength(6);
    expect(rows[0]?.sku).toBe("KTM-HDY-S-BLACK");
    expect(rows[0]?.price_minor).toBe(249900);
    expect(rows[5]?.title).toBe("M / Coral");
  });

  it("builds deterministic SKUs and detects duplicates case-insensitively", () => {
    expect(buildSkuFromPrefix("pkr-tee", { Size: "L", Colour: "Olive" })).toBe(
      "PKR-TEE-L-OLIVE"
    );
    expect(findDuplicateSkus(["SKU-1", "sku-1", "SKU-2"])).toEqual(["SKU-1"]);
    expect(findDuplicateSkus(["SKU-1", "SKU-2"])).toEqual([]);
  });
});
