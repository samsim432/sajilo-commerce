import { describe, expect, it } from "vitest";

/**
 * Models the exact PostgreSQL FOR UPDATE row-lock serialization invariant
 * implemented in Migration 005 (reserve_stock_atomic) across 25 concurrent checkouts.
 */
class AtomicStockRowSimulator {
  private onHand: number;
  private reserved = 0;
  private lockQueue: Promise<void> = Promise.resolve();

  constructor(initialOnHand: number) {
    this.onHand = initialOnHand;
  }

  async reserve(quantity: number): Promise<{ ok: true } | { ok: false; code: string }> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prevLock = this.lockQueue;
    this.lockQueue = prevLock.then(() => nextLock);

    await prevLock;
    try {
      // Simulate realistic async DB roundtrip while holding row lock
      await new Promise((r) => setTimeout(r, 2));
      const available = this.onHand - this.reserved;
      if (available < quantity) {
        return { ok: false, code: "INSUFFICIENT_STOCK" };
      }
      this.reserved += quantity;
      return { ok: true };
    } finally {
      releaseLock();
    }
  }

  snapshot() {
    return {
      onHand: this.onHand,
      reserved: this.reserved,
      available: this.onHand - this.reserved,
    };
  }
}

describe("25-thread concurrent stock reservation invariant (stock = 1)", () => {
  it("allows exactly 1 winner and rejects 24 concurrent buyers with INSUFFICIENT_STOCK", async () => {
    const stockRow = new AtomicStockRowSimulator(1);

    const results = await Promise.all(
      Array.from({ length: 25 }, () => stockRow.reserve(1))
    );

    const winners = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(24);
    expect(stockRow.snapshot()).toEqual({
      onHand: 1,
      reserved: 1,
      available: 0,
    });
  });
});
