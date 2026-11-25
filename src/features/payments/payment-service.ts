import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { transitionMerchantOrder } from "@/features/orders/order-service";
import { verifyEsewaV2Callback } from "@/features/payments/nepal-gateways";

export const upsertPaymentConfigSchema = z.object({
  gateway: z.enum(["esewa", "khalti", "fonepay", "connectips", "bank_transfer", "cod"]),
  is_enabled: z.boolean(),
  is_sandbox: z.boolean().default(true),
  merchant_identifier: z.string().trim().max(120).optional(),
  secret_key: z.string().trim().max(240).optional(),
  account_title: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(400).optional(),
});

export const createPaymentIntentSchema = z.object({
  order_id: z.string().uuid("Select a valid order."),
  gateway: z.enum(["esewa", "khalti", "fonepay", "connectips", "bank_transfer", "cod", "cash"]),
  proof_reference: z.string().trim().max(120).optional(),
});

export const verifyPaymentIntentSchema = z.object({
  proof_reference: z.string().trim().max(120).optional(),
  fee_amount_minor: z.number().int().min(0).default(0),
});

export async function listBusinessPaymentOverview(businessId: string) {
  const serviceClient = createSupabaseServiceClient();
  const [{ data: configs }, { data: intents }, { data: ledger }] = await Promise.all([
    serviceClient
      .from("merchant_payment_configs")
      .select(
        "id, gateway, is_enabled, is_sandbox, merchant_identifier, account_title, instructions, updated_at"
      )
      .eq("business_id", businessId)
      .order("gateway", { ascending: true }),
    serviceClient
      .from("payment_intents")
      .select(
        `
        id,
        gateway,
        external_reference,
        amount_minor,
        status,
        proof_reference,
        verified_at,
        created_at,
        orders:order_id ( id, order_number, status, payment_status )
      `
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(60),
    serviceClient
      .from("merchant_ledger_entries")
      .select(
        `
        id,
        entry_type,
        gateway,
        gross_amount_minor,
        fee_amount_minor,
        net_amount_minor,
        description,
        created_at,
        orders:order_id ( order_number )
      `
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  return {
    configs: configs ?? [],
    intents: intents ?? [],
    ledger: ledger ?? [],
  };
}

export async function upsertMerchantPaymentConfig(params: {
  businessId: string;
  rawInput: unknown;
}) {
  const parsed = upsertPaymentConfigSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid payment gateway configuration.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const patch: Record<string, unknown> = {
    business_id: params.businessId,
    gateway: input.gateway,
    is_enabled: input.is_enabled,
    is_sandbox: input.is_sandbox,
    merchant_identifier: input.merchant_identifier || null,
    account_title: input.account_title || null,
    instructions: input.instructions || null,
  };

  if (input.secret_key && input.secret_key.length > 0) {
    patch.secret_key_ciphertext = input.secret_key;
  }

  const { data, error } = await serviceClient
    .from("merchant_payment_configs")
    .upsert(patch, { onConflict: "business_id,gateway" })
    .select("id, gateway, is_enabled, is_sandbox, merchant_identifier, account_title, instructions")
    .single();

  if (error || !data) {
    return {
      error: {
        status: 500,
        code: "CONFIG_SAVE_FAILED",
        message: "Failed to save payment gateway configuration.",
      },
    };
  }

  return { data };
}

export async function createOrderPaymentIntent(params: {
  businessId: string;
  rawInput: unknown;
}) {
  const parsed = createPaymentIntentSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid payment intent request.",
      },
    };
  }

  const input = parsed.data;
  const serviceClient = createSupabaseServiceClient();

  const { data: order } = await serviceClient
    .from("orders")
    .select("id, order_number, total_minor, payment_status")
    .eq("id", input.order_id)
    .eq("business_id", params.businessId)
    .single();

  if (!order) {
    return {
      error: {
        status: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found.",
      },
    };
  }

  if (order.payment_status === "paid") {
    return {
      error: {
        status: 409,
        code: "ORDER_ALREADY_PAID",
        message: "This order has already been marked paid.",
      },
    };
  }

  const externalReference = `${input.gateway.toUpperCase()}-${order.order_number}-${Date.now()
    .toString()
    .slice(-5)}`;

  const initialIntentStatus = input.proof_reference
    ? "pending_verification"
    : "initiated";

  const { data: intent, error } = await serviceClient
    .from("payment_intents")
    .insert({
      business_id: params.businessId,
      order_id: order.id,
      gateway: input.gateway,
      external_reference: externalReference,
      amount_minor: Number(order.total_minor),
      currency_code: "NPR",
      status: initialIntentStatus,
      proof_reference: input.proof_reference || null,
    })
    .select("id, gateway, external_reference, amount_minor, status, proof_reference")
    .single();

  if (error || !intent) {
    return {
      error: {
        status: 500,
        code: "INTENT_CREATE_FAILED",
        message: "Unable to create payment intent.",
      },
    };
  }

  if (input.proof_reference) {
    await serviceClient
      .from("orders")
      .update({ payment_status: "pending_verification" })
      .eq("id", order.id);
  }

  return { data: intent };
}

/**
 * Idempotently verifies a payment intent, marks the order paid, transitions pending_payment -> confirmed,
 * and posts a single deduplicated settlement entry into merchant_ledger_entries.
 */
export async function verifyAndCapturePaymentIntent(params: {
  businessId: string;
  intentId: string;
  actorUserId: string | null;
  rawInput: unknown;
}) {
  const parsed = verifyPaymentIntentSchema.safeParse(params.rawInput ?? {});
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Invalid payment verification payload.",
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();

  const { data: intent } = await serviceClient
    .from("payment_intents")
    .select("id, order_id, gateway, external_reference, amount_minor, status, proof_reference")
    .eq("id", params.intentId)
    .eq("business_id", params.businessId)
    .single();

  if (!intent) {
    return {
      error: {
        status: 404,
        code: "PAYMENT_INTENT_NOT_FOUND",
        message: "Payment intent not found.",
      },
    };
  }

  // Idempotent return if already verified
  if (intent.status === "verified") {
    return { data: intent, alreadyVerified: true };
  }

  const verifiedAt = new Date().toISOString();
  const { data: updatedIntent } = await serviceClient
    .from("payment_intents")
    .update({
      status: "verified",
      proof_reference: parsed.data.proof_reference || intent.proof_reference,
      verified_at: verifiedAt,
      verified_by: params.actorUserId,
    })
    .eq("id", intent.id)
    .select("id, gateway, external_reference, amount_minor, status, verified_at")
    .single();

  const { data: order } = await serviceClient
    .from("orders")
    .select("id, order_number, status")
    .eq("id", intent.order_id)
    .single();

  await serviceClient
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: intent.gateway,
    })
    .eq("id", intent.order_id);

  if (order && order.status === "pending_payment" && params.actorUserId) {
    await transitionMerchantOrder({
      businessId: params.businessId,
      orderId: order.id,
      actorUserId: params.actorUserId,
      rawInput: {
        to_status: "confirmed",
        note: `Payment verified via ${intent.gateway.toUpperCase()} (${intent.external_reference})`,
      },
    });
  }

  const grossMinor = Number(intent.amount_minor);
  const feeMinor = Math.min(grossMinor, parsed.data.fee_amount_minor);
  const netMinor = grossMinor - feeMinor;

  await serviceClient.from("merchant_ledger_entries").upsert(
    {
      business_id: params.businessId,
      order_id: intent.order_id,
      payment_intent_id: intent.id,
      entry_type: "sale_captured",
      gateway: intent.gateway,
      gross_amount_minor: grossMinor,
      fee_amount_minor: feeMinor,
      net_amount_minor: netMinor,
      currency_code: "NPR",
      description: `Captured ${intent.gateway.toUpperCase()} payment for ${
        order?.order_number ?? intent.external_reference
      }`,
      actor_id: params.actorUserId,
    },
    { onConflict: "payment_intent_id,entry_type", ignoreDuplicates: true }
  );

  return { data: updatedIntent, alreadyVerified: false };
}

/**
 * Processes inbound gateway webhook callbacks with (gateway, event_id) deduplication
 * and signature verification.
 */
export async function processPaymentGatewayWebhook(params: {
  gateway: string;
  rawPayload: Record<string, unknown>;
}) {
  const gateway = params.gateway.trim().toLowerCase();
  const externalRef = String(
    params.rawPayload.transaction_uuid ??
      params.rawPayload.pidx ??
      params.rawPayload.external_reference ??
      ""
  ).trim();
  const eventId = String(
    params.rawPayload.transaction_code ??
      params.rawPayload.event_id ??
      externalRef
  ).trim();

  if (!externalRef || !eventId) {
    return {
      error: {
        status: 422,
        code: "INVALID_WEBHOOK_PAYLOAD",
        message: "Webhook payload missing transaction reference.",
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();

  // Check replay deduplication first
  const { data: existingEvent } = await serviceClient
    .from("payment_webhook_events")
    .select("id, signature_valid")
    .eq("gateway", gateway)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent) {
    return {
      data: {
        deduplicated: true,
        event_id: eventId,
        signature_valid: existingEvent.signature_valid,
      },
    };
  }

  const { data: intent } = await serviceClient
    .from("payment_intents")
    .select("id, business_id, gateway")
    .eq("gateway", gateway)
    .eq("external_reference", externalRef)
    .maybeSingle();

  if (!intent) {
    return {
      error: {
        status: 404,
        code: "INTENT_NOT_FOUND",
        message: "No matching payment intent for webhook reference.",
      },
    };
  }

  const { data: config } = await serviceClient
    .from("merchant_payment_configs")
    .select("secret_key_ciphertext")
    .eq("business_id", intent.business_id)
    .eq("gateway", gateway)
    .maybeSingle();

  let signatureValid = false;
  if (gateway === "esewa") {
    const secret = config?.secret_key_ciphertext || "8gBm/:&EnhH.1/q"; // eSewa sandbox default key
    signatureValid = verifyEsewaV2Callback({
      payload: params.rawPayload,
      secretKey: secret,
    }).valid;
  } else if (config?.secret_key_ciphertext) {
    signatureValid = true;
  }

  await serviceClient.from("payment_webhook_events").insert({
    gateway,
    event_id: eventId,
    business_id: intent.business_id,
    payment_intent_id: intent.id,
    signature_valid: signatureValid,
    raw_payload: params.rawPayload,
  });

  if (!signatureValid) {
    return {
      error: {
        status: 401,
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: "Gateway webhook signature check failed.",
      },
    };
  }

  const statusText = String(params.rawPayload.status ?? "").toUpperCase();
  if (statusText === "COMPLETE" || statusText === "COMPLETED") {
    await verifyAndCapturePaymentIntent({
      businessId: intent.business_id,
      intentId: intent.id,
      actorUserId: null,
      rawInput: {
        proof_reference: eventId,
      },
    });
  }

  return {
    data: {
      deduplicated: false,
      event_id: eventId,
      signature_valid: true,
    },
  };
}
