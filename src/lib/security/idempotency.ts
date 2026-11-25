import crypto from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export function hashRequestPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export async function lookupIdempotentResponse(params: {
  scopeKey: string;
  idempotencyKey: string | null;
  requestHash: string;
}): Promise<
  | { hit: true; status: number; body: unknown }
  | { hit: false; conflict?: { status: number; code: string; message: string } }
> {
  if (!params.idempotencyKey || params.idempotencyKey.trim().length < 4) {
    return { hit: false };
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("idempotency_keys")
    .select("request_hash, response_status, response_body, expires_at")
    .eq("scope_key", params.scopeKey)
    .eq("idempotency_key", params.idempotencyKey.trim())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) {
    return { hit: false };
  }

  if (data.request_hash !== params.requestHash) {
    return {
      hit: false,
      conflict: {
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used with a different request payload.",
      },
    };
  }

  return {
    hit: true,
    status: data.response_status,
    body: data.response_body,
  };
}

export async function storeIdempotentResponse(params: {
  scopeKey: string;
  idempotencyKey: string | null;
  requestHash: string;
  status: number;
  body: unknown;
}) {
  if (!params.idempotencyKey || params.idempotencyKey.trim().length < 4) {
    return;
  }

  const serviceClient = createSupabaseServiceClient();
  await serviceClient.from("idempotency_keys").upsert(
    {
      scope_key: params.scopeKey,
      idempotency_key: params.idempotencyKey.trim(),
      request_hash: params.requestHash,
      response_status: params.status,
      response_body: params.body as Record<string, unknown>,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "scope_key,idempotency_key" }
  );
}
