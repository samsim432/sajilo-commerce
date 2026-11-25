import { describe, expect, it } from "vitest";
import {
  canTransitionOrderStatus,
  getAllowedNextStatuses,
  resolveStockTransitionEffect,
} from "@/features/orders/state-machine";

describe("12-state Order Lifecycle State Machine", () => {
  it("allows valid forward fulfillment transitions", () => {
    expect(canTransitionOrderStatus("pending_payment", "confirmed")).toBe(true);
    expect(canTransitionOrderStatus("confirmed", "packed")).toBe(true);
    expect(canTransitionOrderStatus("packed", "shipped")).toBe(true);
    expect(canTransitionOrderStatus("shipped", "delivered")).toBe(true);
    expect(getAllowedNextStatuses("cancelled")).toEqual([]);
  });

  it("blocks invalid backward or post-shipment cancellations", () => {
    expect(canTransitionOrderStatus("shipped", "cancelled")).toBe(false);
    expect(canTransitionOrderStatus("delivered", "confirmed")).toBe(false);
    expect(canTransitionOrderStatus("confirmed", "confirmed")).toBe(false);
  });

  it("computes exact inventory side effects for cancel, ship, and confirm", () => {
    expect(
      resolveStockTransitionEffect({
        from: "confirmed",
        to: "cancelled",
        stockReserved: true,
        stockDeducted: false,
      })
    ).toBe("release_reserved");

    expect(
      resolveStockTransitionEffect({
        from: "packed",
        to: "shipped",
        stockReserved: true,
        stockDeducted: false,
      })
    ).toBe("deduct_shipped");

    expect(
      resolveStockTransitionEffect({
        from: "pending_payment",
        to: "confirmed",
        stockReserved: false,
        stockDeducted: false,
      })
    ).toBe("reserve");
  });
});
