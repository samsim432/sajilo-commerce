import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { transitionMerchantOrder } from "@/features/orders/order-service";
import {
  computeCodBatchVariance,
  type ShippingZoneConfig,
} from "@/features/shipping/nepal-shipping-calculator";

export const createShippingZoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  zone_code: z.enum(["inside_valley", "outside_valley", "remote_district", "custom"]),
  districts: z.array(z.string().trim().min(1)).default([]),
  rate_label: z.string().trim().min(2).max(80).default("Standard Delivery"),
  flat_fee_minor: z.number().int().min(0),
  free_shipping_min_order_minor: z.number().int().min(0).nullable().optional(),
  estimated_days_min: z.number().int().min(0).default(1),
  estimated_days_max: z.number().int().min(1).default(3),
  cod_allowed: z.boolean().default(true),
});

export const createShipmentSchema = z.object({
  order_id: z.string().uuid("Select a valid order."),
  courier_provider: z.enum([
    "pathao",
    "ncm",
    "sundar",
    "upakar",
    "self_rider",
    "custom",
  ]),
  courier_name_custom: z.string().trim().max(80).optional(),
  tracking_number: z.string().trim().max(80).optional(),
  rider_name: z.string().trim().max(80).optional(),
  rider_phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(240).optional(),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum([
    "label_created",
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "failed_attempt",
    "returned_to_origin",
  ]),
  cod_collected_minor: z.number().int().min(0).optional(),
  notes: z.string().trim().max(240).optional(),
});

export const reconcileCodBatchSchema = z.object({
  courier_provider: z.string().trim().min(2).max(60),
  shipment_ids: z.array(z.string().uuid()).min(1, "Select at least one delivered COD shipment."),
  remitted_total_minor: z.number().int().min(0),
  notes: z.string().trim().max(300).optional(),
});

export async function listBusinessShippingZones(
  businessId: string
): Promise<ShippingZoneConfig[]> {
  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("shipping_zones")
    .select(
      `
      id,
      name,
      zone_code,
      districts,
      shipping_rates (
        id,
        label,
        flat_fee_minor,
        free_shipping_min_order_minor,
        estimated_days_min,
        estimated_days_max,
        cod_allowed,
        is_active
      )
    `
    )
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    zone_code: ShippingZoneConfig["zone_code"];
    districts: string[];
    shipping_rates?: ShippingZoneConfig["rates"];
  }>).map((z) => ({
    id: z.string(),
    name: z.name,
    zone_code: z.zone_code,
    districts: z.districts ?? [],
    rates: z.shipping_rates ?? [],
  }));
}

export async function createShippingZoneWithRate(params: {
  businessId: string;
  rawInput: unknown;
}) {
  const parsed = createShippingZoneSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid shipping zone payload.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const { data: zone, error: zErr } = await serviceClient
    .from("shipping_zones")
    .insert({
      business_id: params.businessId,
      name: input.name,
      zone_code: input.zone_code,
      districts: input.districts,
      is_active: true,
    })
    .select("id, name, zone_code, districts")
    .single();

  if (zErr || !zone) {
    return {
      error: {
        status: 409,
        code: "ZONE_ALREADY_EXISTS",
        message: "A shipping zone with this name already exists.",
      },
    };
  }

  await serviceClient.from("shipping_rates").insert({
    business_id: params.businessId,
    zone_id: zone.id,
    label: input.rate_label,
    flat_fee_minor: input.flat_fee_minor,
    free_shipping_min_order_minor: input.free_shipping_min_order_minor ?? null,
    estimated_days_min: input.estimated_days_min,
    estimated_days_max: Math.max(input.estimated_days_min, input.estimated_days_max),
    cod_allowed: input.cod_allowed,
    is_active: true,
  });

  return { data: zone };
}

export async function listBusinessShipments(businessId: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("shipments")
    .select(
      `
      id,
      courier_provider,
      courier_name_custom,
      tracking_number,
      rider_name,
      rider_phone,
      status,
      is_cod,
      cod_expected_minor,
      cod_collected_minor,
      cod_reconciled,
      dispatched_at,
      delivered_at,
      created_at,
      orders:order_id (
        id,
        order_number,
        status,
        total_minor,
        customers:customer_id ( full_name, phone_e164 )
      )
    `
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  return data ?? [];
}

export async function dispatchOrderShipment(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = createShipmentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid shipment details.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const { data: order } = await serviceClient
    .from("orders")
    .select("id, order_number, status, payment_method, total_minor")
    .eq("id", input.order_id)
    .eq("business_id", params.businessId)
    .single();

  if (!order) {
    return {
      error: {
        status: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found in this business.",
      },
    };
  }

  const isCod = order.payment_method === "cod";
  const codExpectedMinor = isCod ? Number(order.total_minor) : 0;

  const { data: shipment, error: shipErr } = await serviceClient
    .from("shipments")
    .insert({
      business_id: params.businessId,
      order_id: order.id,
      courier_provider: input.courier_provider,
      courier_name_custom: input.courier_name_custom || null,
      tracking_number: input.tracking_number || null,
      rider_name: input.rider_name || null,
      rider_phone: input.rider_phone || null,
      status: "picked_up",
      is_cod: isCod,
      cod_expected_minor: codExpectedMinor,
      cod_collected_minor: 0,
      cod_reconciled: false,
      notes: input.notes || null,
      dispatched_at: new Date().toISOString(),
      created_by: params.actorUserId,
    })
    .select("id, courier_provider, tracking_number, status, is_cod, cod_expected_minor")
    .single();

  if (shipErr || !shipment) {
    return {
      error: {
        status: 500,
        code: "SHIPMENT_CREATE_FAILED",
        message: "Could not create courier shipment.",
      },
    };
  }

  // Advance order to shipped if currently confirmed/processing/packed
  if (["confirmed", "processing", "packed"].includes(order.status)) {
    await transitionMerchantOrder({
      businessId: params.businessId,
      orderId: order.id,
      actorUserId: params.actorUserId,
      rawInput: {
        to_status: "shipped",
        note: `Dispatched via ${input.courier_provider.toUpperCase()}${
          input.tracking_number ? ` (${input.tracking_number})` : ""
        }`,
      },
    });
  }

  return { data: shipment };
}

export async function updateShipmentDeliveryStatus(params: {
  businessId: string;
  shipmentId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = updateShipmentStatusSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid shipment status update.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const { data: shipment } = await serviceClient
    .from("shipments")
    .select("id, order_id, is_cod, cod_expected_minor, status")
    .eq("id", params.shipmentId)
    .eq("business_id", params.businessId)
    .single();

  if (!shipment) {
    return {
      error: {
        status: 404,
        code: "SHIPMENT_NOT_FOUND",
        message: "Shipment not found.",
      },
    };
  }

  const patch: Record<string, unknown> = {
    status: input.status,
  };
  if (input.notes) patch.notes = input.notes;

  if (input.status === "delivered") {
    patch.delivered_at = new Date().toISOString();
    if (shipment.is_cod) {
      patch.cod_collected_minor =
        input.cod_collected_minor ?? Number(shipment.cod_expected_minor);
    }
  }

  const { data: updated } = await serviceClient
    .from("shipments")
    .update(patch)
    .eq("id", shipment.id)
    .select("id, status, cod_expected_minor, cod_collected_minor, delivered_at")
    .single();

  if (input.status === "delivered") {
    await transitionMerchantOrder({
      businessId: params.businessId,
      orderId: shipment.order_id,
      actorUserId: params.actorUserId,
      rawInput: {
        to_status: "delivered",
        note: "Confirmed delivered by courier",
      },
    });
  } else if (input.status === "returned_to_origin") {
    await transitionMerchantOrder({
      businessId: params.businessId,
      orderId: shipment.order_id,
      actorUserId: params.actorUserId,
      rawInput: {
        to_status: "return_requested",
        note: "Parcel returned to origin by courier",
      },
    });
  }

  return { data: updated };
}

export async function reconcileCodCashBatch(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = reconcileCodBatchSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid COD reconciliation payload.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const { data: shipments } = await serviceClient
    .from("shipments")
    .select("id, order_id, status, is_cod, cod_reconciled, cod_expected_minor, cod_collected_minor")
    .eq("business_id", params.businessId)
    .in("id", input.shipment_ids);

  const eligible = (shipments ?? []).filter(
    (s) => s.is_cod && s.status === "delivered" && !s.cod_reconciled
  );

  if (eligible.length === 0) {
    return {
      error: {
        status: 422,
        code: "NO_ELIGIBLE_COD_SHIPMENTS",
        message: "Select delivered, unreconciled COD shipments.",
      },
    };
  }

  const expectedTotalMinor = eligible.reduce(
    (sum, s) => sum + Number(s.cod_expected_minor),
    0
  );

  const variance = computeCodBatchVariance({
    expectedTotalMinor,
    remittedTotalMinor: input.remitted_total_minor,
  });

  const batchRef = `COD-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(
    100 + Math.random() * 900
  )}`;

  const { data: batch, error: bErr } = await serviceClient
    .from("cod_reconciliation_batches")
    .insert({
      business_id: params.businessId,
      batch_reference: batchRef,
      courier_provider: input.courier_provider,
      expected_total_minor: variance.expectedTotalMinor,
      remitted_total_minor: variance.remittedTotalMinor,
      variance_minor: variance.varianceMinor,
      status: variance.isBalanced ? "reconciled" : "disputed",
      notes: input.notes || null,
      reconciled_by: params.actorUserId,
    })
    .select("id, batch_reference, expected_total_minor, remitted_total_minor, variance_minor, status")
    .single();

  if (bErr || !batch) {
    return {
      error: {
        status: 500,
        code: "COD_BATCH_FAILED",
        message: "Could not record COD reconciliation batch.",
      },
    };
  }

  await serviceClient.from("cod_reconciliation_items").insert(
    eligible.map((s) => ({
      business_id: params.businessId,
      batch_id: batch.id,
      shipment_id: s.id,
      order_id: s.order_id,
      expected_minor: Number(s.cod_expected_minor),
      collected_minor: Number(s.cod_collected_minor || s.cod_expected_minor),
    }))
  );

  const shipmentIds = eligible.map((s) => s.id);
  const orderIds = eligible.map((s) => s.order_id);

  await serviceClient
    .from("shipments")
    .update({ cod_reconciled: true })
    .in("id", shipmentIds)
    .eq("business_id", params.businessId);

  await serviceClient
    .from("orders")
    .update({ payment_status: "paid" })
    .in("id", orderIds)
    .eq("business_id", params.businessId);

  return { data: batch };
}
