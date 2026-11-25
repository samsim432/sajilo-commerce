export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StockTransitionEffect =
  | "none"
  | "reserve"
  | "deduct_shipped"
  | "release_reserved";

const ALLOWED_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  draft: new Set<OrderStatus>(["pending_payment", "confirmed", "cancelled"]),
  pending_payment: new Set<OrderStatus>(["confirmed", "cancelled"]),
  confirmed: new Set<OrderStatus>(["processing", "packed", "cancelled"]),
  processing: new Set<OrderStatus>(["packed", "cancelled"]),
  packed: new Set<OrderStatus>(["shipped", "cancelled"]),
  shipped: new Set<OrderStatus>(["out_for_delivery", "delivered", "return_requested"]),
  out_for_delivery: new Set<OrderStatus>(["delivered", "return_requested"]),
  delivered: new Set<OrderStatus>(["return_requested", "refunded"]),
  cancelled: new Set<OrderStatus>([]),
  return_requested: new Set<OrderStatus>(["returned", "delivered"]),
  returned: new Set<OrderStatus>(["refunded"]),
  refunded: new Set<OrderStatus>([]),
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].has(to);
}

export function getAllowedNextStatuses(current: OrderStatus): OrderStatus[] {
  return Array.from(ALLOWED_TRANSITIONS[current]);
}

/**
 * Determines the atomic inventory action required when transitioning an order
 * between two states, given whether stock is currently reserved or deducted.
 */
export function resolveStockTransitionEffect(params: {
  from: OrderStatus;
  to: OrderStatus;
  stockReserved: boolean;
  stockDeducted: boolean;
}): StockTransitionEffect {
  const { to, stockReserved, stockDeducted } = params;

  if (to === "cancelled" && stockReserved && !stockDeducted) {
    return "release_reserved";
  }

  if (
    (to === "shipped" || to === "out_for_delivery" || to === "delivered") &&
    !stockDeducted
  ) {
    return "deduct_shipped";
  }

  if (
    (to === "confirmed" || to === "processing" || to === "packed") &&
    !stockReserved &&
    !stockDeducted
  ) {
    return "reserve";
  }

  return "none";
}

export class InvalidOrderTransitionError extends Error {
  readonly status = 409;
  readonly code = "INVALID_ORDER_TRANSITION";

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from '${from}' to '${to}'.`);
    this.name = "InvalidOrderTransitionError";
  }
}
