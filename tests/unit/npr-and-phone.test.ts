import { describe, expect, it } from "vitest";
import {
  formatNpr,
  normalizeNepalPhone,
  nprToPaisa,
  paisaToNpr,
} from "@/lib/currency/npr";

describe("NPR minor-unit (paisa) helpers", () => {
  it("converts NPR major units to exact integer paisa without float drift", () => {
    expect(nprToPaisa(1499)).toBe(149900);
    expect(nprToPaisa(499)).toBe(49900);
    expect(nprToPaisa(19.99)).toBe(1999);
    expect(paisaToNpr(149900)).toBe(1499);
  });

  it("formats whole and decimal paisa values consistently", () => {
    expect(formatNpr(4250000)).toBe("NPR 42,500");
    expect(formatNpr(149950)).toBe("NPR 1,499.50");
    expect(formatNpr(149900, { showDecimals: true })).toBe("NPR 1,499.00");
  });
});

describe("Nepali mobile phone normalization (+977)", () => {
  it("normalizes valid 10-digit, leading-zero, and 977-prefixed numbers", () => {
    expect(normalizeNepalPhone("9841234567")).toBe("+9779841234567");
    expect(normalizeNepalPhone("0984-123-4567")).toBe("+9779841234567");
    expect(normalizeNepalPhone("+977 9701234567")).toBe("+9779701234567");
  });

  it("rejects invalid or non-mobile numbers", () => {
    expect(normalizeNepalPhone("12345")).toBeNull();
    expect(normalizeNepalPhone("9141234567")).toBeNull();
    expect(normalizeNepalPhone("")).toBeNull();
  });
});