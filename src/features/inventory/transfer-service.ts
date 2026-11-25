import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const createTransferSchema = z
  .object({
    source_location_id: z.string().uuid("Select source location."),
    destination_location_id: z.string().uuid("Select destination location."),
    variant_id: z.string().uuid("Select product variant."),
    quantity: z.number().int().min(1, "Transfer quantity must be at least 1."),
    notes: z.string().trim().max(240).optional(),
  })
  .refine((d) => d.source_location_id !== d.destination_location_id, {
    message: "Source and destination locations must be different.",
  });

export async function listStockTransfers(businessId: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("stock_transfers")
    .select(
      `
      id,
      status,
      notes,
      dispatched_at,
      completed_at,
      created_at,
      source:source_location_id ( id, name ),
      destination:destination_location_id ( id, name ),
      stock_transfer_items (
        id,
        quantity,
        product_variants:variant_id ( id, sku, title )
      )
    `
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

/**
 * Dispatches a stock transfer immediately from source location (deducting source on_hand
 * into in_transit status and writing transfer_out to stock_movements).
 */
export async function dispatchStockTransfer(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = createTransferSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid transfer payload.",
      },
    };
  }

  const {
    source_location_id,
    destination_location_id,
    variant_id,
    quantity,
    notes,
  } = parsed.data;

  const serviceClient = createSupabaseServiceClient();

  const [{ data: srcLoc }, { data: dstLoc }, { data: srcLevel }] = await Promise.all([
    serviceClient
      .from("locations")
      .select("id")
      .eq("id", source_location_id)
      .eq("business_id", params.businessId)
      .single(),
    serviceClient
      .from("locations")
      .select("id")
      .eq("id", destination_location_id)
      .eq("business_id", params.businessId)
      .single(),
    serviceClient
      .from("stock_levels")
      .select("id, on_hand_quantity, reserved_quantity")
      .eq("business_id", params.businessId)
      .eq("location_id", source_location_id)
      .eq("variant_id", variant_id)
      .maybeSingle(),
  ]);

  if (!srcLoc || !dstLoc) {
    return {
      error: {
        status: 404,
        code: "LOCATION_NOT_FOUND",
        message: "Source or destination location does not belong to this workspace.",
      },
    };
  }

  const onHand = srcLevel?.on_hand_quantity ?? 0;
  const reserved = srcLevel?.reserved_quantity ?? 0;
  const available = onHand - reserved;

  if (!srcLevel || available < quantity) {
    return {
      error: {
        status: 422,
        code: "INSUFFICIENT_AVAILABLE_STOCK",
        message: `Only ${Math.max(0, available)} unreserved unit(s) available at source location.`,
      },
    };
  }

  const nextSourceOnHand = onHand - quantity;

  const { data: transfer, error: trErr } = await serviceClient
    .from("stock_transfers")
    .insert({
      business_id: params.businessId,
      source_location_id,
      destination_location_id,
      status: "in_transit",
      notes: notes || null,
      created_by: params.actorUserId,
      dispatched_at: new Date().toISOString(),
    })
    .select("id, status, dispatched_at")
    .single();

  if (trErr || !transfer) {
    return {
      error: {
        status: 500,
        code: "TRANSFER_CREATE_FAILED",
        message: "Failed to create stock transfer.",
      },
    };
  }

  await serviceClient.from("stock_transfer_items").insert({
    business_id: params.businessId,
    transfer_id: transfer.id,
    variant_id,
    quantity,
  });

  await serviceClient
    .from("stock_levels")
    .update({ on_hand_quantity: nextSourceOnHand })
    .eq("id", srcLevel.id);

  await serviceClient.from("stock_movements").insert({
    business_id: params.businessId,
    location_id: source_location_id,
    variant_id,
    movement_type: "transfer_out",
    quantity_delta: -quantity,
    reserved_delta: 0,
    on_hand_after: nextSourceOnHand,
    reserved_after: reserved,
    reason: notes || "Branch stock transfer dispatched",
    reference_type: "stock_transfer",
    reference_id: transfer.id,
    actor_id: params.actorUserId,
  });

  return { data: transfer };
}

/**
 * Confirms receipt of an in_transit stock transfer at the destination branch.
 */
export async function completeStockTransfer(params: {
  businessId: string;
  transferId: string;
  actorUserId: string;
}) {
  const serviceClient = createSupabaseServiceClient();

  const { data: transfer } = await serviceClient
    .from("stock_transfers")
    .select(
      `
      id,
      status,
      destination_location_id,
      notes,
      stock_transfer_items ( variant_id, quantity )
    `
    )
    .eq("id", params.transferId)
    .eq("business_id", params.businessId)
    .single();

  if (!transfer) {
    return {
      error: {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Stock transfer not found.",
      },
    };
  }

  if (transfer.status !== "in_transit") {
    return {
      error: {
        status: 409,
        code: "INVALID_TRANSFER_STATE",
        message: `Cannot complete transfer in '${transfer.status}' status.`,
      },
    };
  }

  const items = (transfer.stock_transfer_items ?? []) as Array<{
    variant_id: string;
    quantity: number;
  }>;

  for (const item of items) {
    const { data: dstLevel } = await serviceClient
      .from("stock_levels")
      .select("id, on_hand_quantity, reserved_quantity")
      .eq("business_id", params.businessId)
      .eq("location_id", transfer.destination_location_id)
      .eq("variant_id", item.variant_id)
      .maybeSingle();

    const prevOnHand = dstLevel?.on_hand_quantity ?? 0;
    const prevReserved = dstLevel?.reserved_quantity ?? 0;
    const nextOnHand = prevOnHand + item.quantity;

    if (dstLevel) {
      await serviceClient
        .from("stock_levels")
        .update({ on_hand_quantity: nextOnHand })
        .eq("id", dstLevel.id);
    } else {
      await serviceClient.from("stock_levels").insert({
        business_id: params.businessId,
        location_id: transfer.destination_location_id,
        variant_id: item.variant_id,
        on_hand_quantity: nextOnHand,
        reserved_quantity: 0,
      });
    }

    await serviceClient.from("stock_movements").insert({
      business_id: params.businessId,
      location_id: transfer.destination_location_id,
      variant_id: item.variant_id,
      movement_type: "transfer_in",
      quantity_delta: item.quantity,
      reserved_delta: 0,
      on_hand_after: nextOnHand,
      reserved_after: prevReserved,
      reason: transfer.notes || "Branch stock transfer received",
      reference_type: "stock_transfer",
      reference_id: transfer.id,
      actor_id: params.actorUserId,
    });
  }

  const { data: completed } = await serviceClient
    .from("stock_transfers")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", transfer.id)
    .select("id, status, completed_at")
    .single();

  return { data: completed };
}
