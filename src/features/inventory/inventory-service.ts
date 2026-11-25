import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const stockAdjustmentSchema = z.object({
  location_id: z.string().uuid("Select a valid branch or warehouse location."),
  variant_id: z.string().uuid("Select a valid product variant."),
  quantity_delta: z
    .number()
    .int()
    .refine((n) => n !== 0, "Quantity delta cannot be zero."),
  reason: z
    .string()
    .trim()
    .min(3, "Provide a clear adjustment reason (at least 3 characters).")
    .max(240),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export interface InventoryBalanceRow {
  stock_level_id: string | null;
  location_id: string;
  location_name: string;
  variant_id: string;
  sku: string;
  variant_title: string;
  product_id: string;
  product_title: string;
  low_stock_threshold: number;
  on_hand_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  is_low_stock: boolean;
}

export async function getInventorySnapshot(params: {
  businessId: string;
  locationId?: string;
}) {
  const serviceClient = createSupabaseServiceClient();

  let locQuery = serviceClient
    .from("locations")
    .select("id, name, is_default, is_active")
    .eq("business_id", params.businessId)
    .eq("is_active", true)
    .order("is_default", { ascending: false });

  if (params.locationId) {
    locQuery = locQuery.eq("id", params.locationId);
  }

  const [{ data: locations }, { data: variants }, { data: levels }, { data: movements }] =
    await Promise.all([
      locQuery,
      serviceClient
        .from("product_variants")
        .select(
          `
          id,
          title,
          sku,
          low_stock_threshold,
          is_active,
          products:product_id!inner (
            id,
            title,
            status,
            track_inventory,
            deleted_at
          )
        `
        )
        .eq("business_id", params.businessId)
        .eq("is_active", true),
      serviceClient
        .from("stock_levels")
        .select("id, location_id, variant_id, on_hand_quantity, reserved_quantity")
        .eq("business_id", params.businessId),
      serviceClient
        .from("stock_movements")
        .select(
          `
          id,
          movement_type,
          quantity_delta,
          reserved_delta,
          on_hand_after,
          reserved_after,
          reason,
          created_at,
          locations:location_id ( name ),
          product_variants:variant_id ( sku, title )
        `
        )
        .eq("business_id", params.businessId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const activeLocations = locations ?? [];
  const levelMap = new Map<
    string,
    { id: string; on_hand_quantity: number; reserved_quantity: number }
  >();
  for (const lvl of levels ?? []) {
    levelMap.set(`${lvl.location_id}:${lvl.variant_id}`, {
      id: lvl.id,
      on_hand_quantity: lvl.on_hand_quantity,
      reserved_quantity: lvl.reserved_quantity,
    });
  }

  type VariantJoinRow = {
    id: string;
    title: string;
    sku: string;
    low_stock_threshold: number;
    products:
      | { id: string; title: string; status: string; track_inventory: boolean; deleted_at: string | null }
      | Array<{ id: string; title: string; status: string; track_inventory: boolean; deleted_at: string | null }>
      | null;
  };

  const activeVariants = ((variants ?? []) as unknown as VariantJoinRow[])
    .map((v) => {
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      return prod && prod.deleted_at === null && prod.track_inventory
        ? { ...v, product: prod }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const rows: InventoryBalanceRow[] = [];
  for (const loc of activeLocations) {
    for (const v of activeVariants) {
      const existing = levelMap.get(`${loc.id}:${v.id}`);
      const onHand = existing?.on_hand_quantity ?? 0;
      const reserved = existing?.reserved_quantity ?? 0;
      const available = Math.max(0, onHand - reserved);
      const isLowStock = available <= v.low_stock_threshold;

      rows.push({
        stock_level_id: existing?.id ?? null,
        location_id: loc.id,
        location_name: loc.name,
        variant_id: v.id,
        sku: v.sku,
        variant_title: v.title,
        product_id: v.product.id,
        product_title: v.product.title,
        low_stock_threshold: v.low_stock_threshold,
        on_hand_quantity: onHand,
        reserved_quantity: reserved,
        available_quantity: available,
        is_low_stock: isLowStock,
      });
    }
  }

  return {
    locations: activeLocations,
    balances: rows,
    lowStockCount: rows.filter((r) => r.is_low_stock).length,
    movements: movements ?? [],
  };
}

export async function applyManualStockAdjustment(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = stockAdjustmentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid stock adjustment payload.",
      },
    };
  }

  const { location_id, variant_id, quantity_delta, reason } = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const [{ data: loc }, { data: variant }, { data: currentLevel }] = await Promise.all([
    serviceClient
      .from("locations")
      .select("id")
      .eq("id", location_id)
      .eq("business_id", params.businessId)
      .single(),
    serviceClient
      .from("product_variants")
      .select("id, sku")
      .eq("id", variant_id)
      .eq("business_id", params.businessId)
      .single(),
    serviceClient
      .from("stock_levels")
      .select("id, on_hand_quantity, reserved_quantity")
      .eq("business_id", params.businessId)
      .eq("location_id", location_id)
      .eq("variant_id", variant_id)
      .maybeSingle(),
  ]);

  if (!loc || !variant) {
    return {
      error: {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Location or product variant not found in this business.",
      },
    };
  }

  const prevOnHand = currentLevel?.on_hand_quantity ?? 0;
  const prevReserved = currentLevel?.reserved_quantity ?? 0;
  const nextOnHand = prevOnHand + quantity_delta;

  if (nextOnHand < 0) {
    return {
      error: {
        status: 422,
        code: "NEGATIVE_ON_HAND_BLOCKED",
        message: `Cannot reduce on-hand stock (${prevOnHand}) by ${Math.abs(quantity_delta)}.`,
      },
    };
  }

  if (nextOnHand < prevReserved) {
    return {
      error: {
        status: 422,
        code: "BELOW_RESERVED_STOCK",
        message: `On-hand stock (${nextOnHand}) cannot drop below reserved order stock (${prevReserved}).`,
      },
    };
  }

  const movementType =
    !currentLevel && quantity_delta > 0 ? "initial_seed" : "manual_adjustment";

  if (currentLevel) {
    const { error: updErr } = await serviceClient
      .from("stock_levels")
      .update({ on_hand_quantity: nextOnHand })
      .eq("id", currentLevel.id)
      .eq("business_id", params.businessId);

    if (updErr) {
      return {
        error: {
          status: 500,
          code: "STOCK_UPDATE_FAILED",
          message: "Failed to update stock level.",
        },
      };
    }
  } else {
    const { error: insErr } = await serviceClient.from("stock_levels").insert({
      business_id: params.businessId,
      location_id,
      variant_id,
      on_hand_quantity: nextOnHand,
      reserved_quantity: 0,
    });

    if (insErr) {
      return {
        error: {
          status: 500,
          code: "STOCK_INSERT_FAILED",
          message: "Failed to initialize stock level.",
        },
      };
    }
  }

  const { data: movement, error: movErr } = await serviceClient
    .from("stock_movements")
    .insert({
      business_id: params.businessId,
      location_id,
      variant_id,
      movement_type: movementType,
      quantity_delta,
      reserved_delta: 0,
      on_hand_after: nextOnHand,
      reserved_after: prevReserved,
      reason,
      reference_type: "manual_adjustment",
      actor_id: params.actorUserId,
    })
    .select("id, movement_type, quantity_delta, on_hand_after, reserved_after, reason, created_at")
    .single();

  if (movErr || !movement) {
    return {
      error: {
        status: 500,
        code: "LEDGER_WRITE_FAILED",
        message: "Failed to record append-only stock movement.",
      },
    };
  }

  return { data: movement };
}
