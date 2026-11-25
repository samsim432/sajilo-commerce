import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { findOrCreateCustomerByPhone } from "@/features/customers/customer-service";
import {
  canTransitionOrderStatus,
  resolveStockTransitionEffect,
  type OrderStatus,
} from "@/features/orders/state-machine";

export const createManualOrderSchema = z.object({
  location_id: z.string().uuid().optional(),
  channel: z
    .enum(["website", "instagram", "facebook", "whatsapp", "tiktok", "manual_phone"])
    .default("instagram"),
  payment_method: z
    .enum(["cod", "esewa", "khalti", "fonepay", "connectips", "bank_transfer", "cash"])
    .default("cod"),
  customer: z.object({
    full_name: z.string().trim().min(1, "Customer name is required.").max(120),
    phone: z.string().trim().min(7, "Customer mobile number is required."),
    instagram_handle: z.string().trim().max(80).optional(),
    address: z
      .object({
        province: z.string().trim().max(100).optional(),
        district: z.string().trim().max(100).optional(),
        city: z.string().trim().max(100).optional(),
        street_address: z.string().trim().min(2).max(240),
        landmark: z.string().trim().max(160).optional(),
      })
      .optional(),
  }),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid("Select a valid product variant."),
        quantity: z.number().int().min(1, "Quantity must be at least 1."),
      })
    )
    .min(1, "Add at least one item to the order."),
  shipping_fee_minor: z.number().int().min(0).default(0),
  discount_minor: z.number().int().min(0).default(0),
  customer_note: z.string().trim().max(500).optional(),
  internal_note: z.string().trim().max(500).optional(),
  reserve_stock_immediately: z.boolean().default(true),
});

export const transitionOrderSchema = z.object({
  to_status: z.enum([
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
  ]),
  note: z.string().trim().max(300).optional(),
});

function formatOrderNumber(): string {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `SC-${stamp}-${suffix}`;
}

export async function listBusinessOrders(params: {
  businessId: string;
  status?: string;
  channel?: string;
  query?: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  let req = serviceClient
    .from("orders")
    .select(
      `
      id,
      order_number,
      channel,
      status,
      payment_method,
      payment_status,
      currency_code,
      subtotal_minor,
      shipping_fee_minor,
      discount_minor,
      total_minor,
      shipping_snapshot,
      customer_note,
      internal_note,
      stock_reserved,
      stock_deducted,
      created_at,
      customers:customer_id (
        id,
        full_name,
        phone_e164,
        instagram_handle,
        cod_risk_flag,
        total_orders,
        returned_orders
      ),
      locations:location_id (
        id,
        name
      ),
      order_items (
        id,
        product_id,
        variant_id,
        product_title,
        variant_title,
        sku,
        quantity,
        unit_price_minor,
        line_total_minor
      )
    `
    )
    .eq("business_id", params.businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.status && params.status !== "all") {
    req = req.eq("status", params.status);
  }
  if (params.channel && params.channel !== "all") {
    req = req.eq("channel", params.channel);
  }

  const { data } = await req;
  const list = data ?? [];

  if (!params.query || !params.query.trim()) {
    return list;
  }

  const q = params.query.trim().toLowerCase();
  return list.filter((row) => {
    const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return (
      row.order_number.toLowerCase().includes(q) ||
      (cust?.full_name ?? "").toLowerCase().includes(q) ||
      (cust?.phone_e164 ?? "").toLowerCase().includes(q)
    );
  });
}

export async function createMerchantOrder(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = createManualOrderSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid order payload.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  // Resolve target fulfillment location
  let locationId = input.location_id;
  if (!locationId) {
    const { data: defaultLoc } = await serviceClient
      .from("locations")
      .select("id")
      .eq("business_id", params.businessId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .single();
    locationId = defaultLoc?.id;
  } else {
    const { data: verifiedLoc } = await serviceClient
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("business_id", params.businessId)
      .single();
    if (!verifiedLoc) {
      return {
        error: {
          status: 404,
          code: "LOCATION_NOT_FOUND",
          message: "Selected fulfillment location does not exist.",
        },
      };
    }
  }

  if (!locationId) {
    return {
      error: {
        status: 400,
        code: "NO_ACTIVE_LOCATION",
        message: "Create an active business location before logging orders.",
      },
    };
  }

  // Deduplicate / upsert customer by +977 phone
  const custResult = await findOrCreateCustomerByPhone({
    businessId: params.businessId,
    fullName: input.customer.full_name,
    rawPhone: input.customer.phone,
    instagramHandle: input.customer.instagram_handle,
    address: input.customer.address,
  });

  if (custResult.error || !custResult.data) {
    return { error: custResult.error };
  }

  // Load authoritative variant prices & product titles
  const variantIds = Array.from(new Set(input.items.map((i) => i.variant_id)));
  const { data: variants } = await serviceClient
    .from("product_variants")
    .select(
      `
      id,
      product_id,
      title,
      sku,
      price_minor,
      products:product_id!inner (
        id,
        title,
        track_inventory,
        deleted_at
      )
    `
    )
    .eq("business_id", params.businessId)
    .in("id", variantIds);

  type VariantRecord = {
    id: string;
    product_id: string;
    title: string;
    sku: string;
    price_minor: number;
    products:
      | { id: string; title: string; track_inventory: boolean; deleted_at: string | null }
      | Array<{ id: string; title: string; track_inventory: boolean; deleted_at: string | null }>
      | null;
  };

  const variantLookup = new Map<
    string,
    {
      id: string;
      product_id: string;
      title: string;
      sku: string;
      price_minor: number;
      product_title: string;
      track_inventory: boolean;
    }
  >();

  for (const v of (variants ?? []) as unknown as VariantRecord[]) {
    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    if (prod && prod.deleted_at === null) {
      variantLookup.set(v.id, {
        id: v.id,
        product_id: v.product_id,
        title: v.title,
        sku: v.sku,
        price_minor: v.price_minor,
        product_title: prod.title,
        track_inventory: prod.track_inventory,
      });
    }
  }

  const lineItems: Array<{
    product_id: string;
    variant_id: string;
    product_title: string;
    variant_title: string;
    sku: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
    track_inventory: boolean;
  }> = [];

  let subtotalMinor = 0;

  for (const item of input.items) {
    const found = variantLookup.get(item.variant_id);
    if (!found) {
      return {
        error: {
          status: 404,
          code: "VARIANT_NOT_FOUND",
          message: "One or more selected product variants were not found.",
        },
      };
    }
    const lineTotal = found.price_minor * item.quantity;
    subtotalMinor += lineTotal;
    lineItems.push({
      product_id: found.product_id,
      variant_id: found.id,
      product_title: found.product_title,
      variant_title: found.title,
      sku: found.sku,
      quantity: item.quantity,
      unit_price_minor: found.price_minor,
      line_total_minor: lineTotal,
      track_inventory: found.track_inventory,
    });
  }

  const totalMinor = Math.max(
    0,
    subtotalMinor + input.shipping_fee_minor - input.discount_minor
  );
  const initialStatus: OrderStatus =
    input.payment_method === "cod" || input.payment_method === "cash"
      ? "confirmed"
      : "pending_payment";

  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .insert({
      business_id: params.businessId,
      order_number: formatOrderNumber(),
      customer_id: custResult.data.id,
      location_id: locationId,
      channel: input.channel,
      status: initialStatus,
      payment_method: input.payment_method,
      payment_status: "unpaid",
      currency_code: "NPR",
      subtotal_minor: subtotalMinor,
      shipping_fee_minor: input.shipping_fee_minor,
      discount_minor: input.discount_minor,
      tax_minor: 0,
      total_minor: totalMinor,
      shipping_snapshot: {
        customer_name: custResult.data.full_name,
        phone_e164: custResult.data.phone_e164,
        ...(input.customer.address ?? {}),
      },
      customer_note: input.customer_note || null,
      internal_note: input.internal_note || null,
      stock_reserved: false,
      stock_deducted: false,
      created_by: params.actorUserId,
      confirmed_at: initialStatus === "confirmed" ? new Date().toISOString() : null,
    })
    .select(
      "id, order_number, status, channel, payment_method, subtotal_minor, shipping_fee_minor, discount_minor, total_minor, created_at"
    )
    .single();

  if (orderErr || !order) {
    return {
      error: {
        status: 500,
        code: "ORDER_CREATE_FAILED",
        message: "Unable to create order.",
      },
    };
  }

  await serviceClient.from("order_items").insert(
    lineItems.map((li) => ({
      business_id: params.businessId,
      order_id: order.id,
      product_id: li.product_id,
      variant_id: li.variant_id,
      product_title: li.product_title,
      variant_title: li.variant_title,
      sku: li.sku,
      quantity: li.quantity,
      unit_price_minor: li.unit_price_minor,
      line_total_minor: li.line_total_minor,
    }))
  );

  // Reserve tracked stock atomically if requested
  const trackedItems = lineItems
    .filter((li) => li.track_inventory)
    .map((li) => ({ variant_id: li.variant_id, quantity: li.quantity }));

  let stockReserved = false;
  if (input.reserve_stock_immediately && trackedItems.length > 0) {
    const { error: rpcErr } = await serviceClient.rpc("reserve_stock_atomic", {
      p_business_id: params.businessId,
      p_location_id: locationId,
      p_items: trackedItems,
      p_reference_type: "order",
      p_reference_id: order.id,
      p_actor_id: params.actorUserId,
    });

    if (rpcErr) {
      await serviceClient.from("orders").delete().eq("id", order.id);
      const isInsufficient = rpcErr.message.includes("INSUFFICIENT_STOCK");
      return {
        error: {
          status: isInsufficient ? 409 : 500,
          code: isInsufficient ? "INSUFFICIENT_STOCK" : "STOCK_RESERVE_FAILED",
          message: isInsufficient
            ? "Insufficient available stock at the selected branch for one or more items."
            : "Failed to reserve stock for order.",
        },
      };
    }

    stockReserved = true;
    await serviceClient
      .from("orders")
      .update({ stock_reserved: true })
      .eq("id", order.id);
  }

  // Update customer aggregate counters
  await serviceClient
    .from("customers")
    .update({
      total_orders: (custResult.data.total_orders ?? 0) + 1,
      total_spent_minor: Number(custResult.data.total_spent_minor ?? 0) + totalMinor,
      last_order_at: new Date().toISOString(),
    })
    .eq("id", custResult.data.id)
    .eq("business_id", params.businessId);

  await serviceClient.from("order_events").insert({
    business_id: params.businessId,
    order_id: order.id,
    event_type: "order.created",
    from_status: null,
    to_status: initialStatus,
    note: `Created via ${input.channel} (${input.payment_method.toUpperCase()})`,
    actor_id: params.actorUserId,
    metadata: { stock_reserved: stockReserved, total_minor: totalMinor },
  });

  return {
    data: {
      ...order,
      stock_reserved: stockReserved,
      customer: custResult.data,
    },
  };
}

export async function transitionMerchantOrder(params: {
  businessId: string;
  orderId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = transitionOrderSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid transition payload.",
      },
    };
  }

  const nextStatus = parsed.data.to_status as OrderStatus;
  const serviceClient = createSupabaseServiceClient();

  const { data: order } = await serviceClient
    .from("orders")
    .select(
      `
      id,
      status,
      location_id,
      customer_id,
      total_minor,
      stock_reserved,
      stock_deducted,
      order_items ( variant_id, quantity )
    `
    )
    .eq("id", params.orderId)
    .eq("business_id", params.businessId)
    .single();

  if (!order) {
    return {
      error: {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Order not found.",
      },
    };
  }

  const currentStatus = order.status as OrderStatus;
  if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
    return {
      error: {
        status: 409,
        code: "INVALID_ORDER_TRANSITION",
        message: `Cannot transition order from '${currentStatus}' to '${nextStatus}'.`,
      },
    };
  }

  const effect = resolveStockTransitionEffect({
    from: currentStatus,
    to: nextStatus,
    stockReserved: Boolean(order.stock_reserved),
    stockDeducted: Boolean(order.stock_deducted),
  });

  const items = ((order.order_items ?? []) as Array<{
    variant_id: string | null;
    quantity: number;
  }>)
    .filter((i): i is { variant_id: string; quantity: number } => Boolean(i.variant_id))
    .map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }));

  let nextReserved = Boolean(order.stock_reserved);
  let nextDeducted = Boolean(order.stock_deducted);

  if (effect === "release_reserved" && items.length > 0) {
    await serviceClient.rpc("release_reserved_stock_atomic", {
      p_business_id: params.businessId,
      p_location_id: order.location_id,
      p_items: items,
      p_reference_type: "order",
      p_reference_id: order.id,
      p_actor_id: params.actorUserId,
    });
    nextReserved = false;
  } else if (effect === "deduct_shipped" && items.length > 0) {
    const { error: dedErr } = await serviceClient.rpc(
      "deduct_shipped_stock_atomic",
      {
        p_business_id: params.businessId,
        p_location_id: order.location_id,
        p_items: items,
        p_order_id: order.id,
        p_actor_id: params.actorUserId,
      }
    );
    if (dedErr) {
      return {
        error: {
          status: 409,
          code: "INSUFFICIENT_STOCK_FOR_SHIPMENT",
          message: "Unable to deduct shipment stock; check branch stock levels.",
        },
      };
    }
    nextReserved = false;
    nextDeducted = true;
  }

  const timestamps: Record<string, unknown> = {
    status: nextStatus,
    stock_reserved: nextReserved,
    stock_deducted: nextDeducted,
  };
  if (nextStatus === "confirmed") timestamps.confirmed_at = new Date().toISOString();
  if (nextStatus === "delivered") timestamps.delivered_at = new Date().toISOString();
  if (nextStatus === "cancelled") timestamps.cancelled_at = new Date().toISOString();

  const { data: updated } = await serviceClient
    .from("orders")
    .update(timestamps)
    .eq("id", order.id)
    .eq("business_id", params.businessId)
    .select("id, status, stock_reserved, stock_deducted, updated_at")
    .single();

  await serviceClient.from("order_events").insert({
    business_id: params.businessId,
    order_id: order.id,
    event_type: "order.status_changed",
    from_status: currentStatus,
    to_status: nextStatus,
    note: parsed.data.note || null,
    actor_id: params.actorUserId,
    metadata: { stock_effect: effect },
  });

  return { data: updated };
}
