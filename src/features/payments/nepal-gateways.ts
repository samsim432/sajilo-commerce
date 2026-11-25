
import crypto from "node:crypto";
import { paisaToNpr } from "@/lib/currency/npr";

export interface EsewaSignParams {
  totalAmountMinor: number;
  transactionUuid: string;
  productCode: string;
  secretKey: string;
}

/**
 * Generates eSewa ePay v2 HMAC-SHA256 Base64 signature over:
 * "total_amount=<npr>,transaction_uuid=<uuid>,product_code=<code>"
 */
export function signEsewaV2Request(params: EsewaSignParams): {
  totalAmountStr: string;
  signedFieldNames: string;
  signature: string;
} {
  if (
    !Number.isSafeInteger(params.totalAmountMinor) ||
    params.totalAmountMinor <= 0
  ) {
    throw new Error("Total amount must be a positive integer in paisa.");
  }

  if (!params.transactionUuid.trim()) {
    throw new Error("Transaction UUID is required.");
  }

  if (!params.productCode.trim()) {
    throw new Error("eSewa product code is required.");
  }

  if (!params.secretKey) {
    throw new Error("eSewa secret key is required.");
  }

  const totalAmountStr = paisaToNpr(
    params.totalAmountMinor
  ).toFixed(2);

  const signedFieldNames =
    "total_amount,transaction_uuid,product_code";

  const message =
    `total_amount=${totalAmountStr},` +
    `transaction_uuid=${params.transactionUuid},` +
    `product_code=${params.productCode}`;

  const signature = crypto
    .createHmac("sha256", params.secretKey)
    .update(message)
    .digest("base64");

  return {
    totalAmountStr,
    signedFieldNames,
    signature,
  };
}

/**
 * Verifies an eSewa v2 callback payload using timing-safe
 * HMAC-SHA256 comparison over signed_field_names.
 */
export function verifyEsewaV2Callback(params: {
  payload: Record<string, unknown>;
  secretKey: string;
}): { valid: boolean; reason?: string } {
  const signedFieldNamesRaw = String(
    params.payload.signed_field_names ?? ""
  );

  const receivedSig = String(
    params.payload.signature ?? ""
  );

  if (!signedFieldNamesRaw || !receivedSig) {
    return {
      valid: false,
      reason: "Missing signed_field_names or signature.",
    };
  }

  if (!params.secretKey) {
    return {
      valid: false,
      reason: "Missing eSewa secret key.",
    };
  }

  const fields = signedFieldNamesRaw
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return {
      valid: false,
      reason: "Empty signed_field_names.",
    };
  }

  if (new Set(fields).size !== fields.length) {
    return {
      valid: false,
      reason: "Duplicate signed fields.",
    };
  }

  const message = fields
    .map(
      (field) =>
        `${field}=${String(params.payload[field] ?? "")}`
    )
    .join(",");

  const expectedSig = crypto
    .createHmac("sha256", params.secretKey)
    .update(message)
    .digest("base64");

  const receivedBuffer = Buffer.from(receivedSig, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return {
      valid: false,
      reason: "Invalid eSewa HMAC signature.",
    };
  }

  return { valid: true };
}

/**
 * Constructs a Khalti v2 payment initiation payload.
 *
 * Khalti expects the payment amount in integer paisa.
 */
export function buildKhaltiV2InitiatePayload(params: {
  returnUrl: string;
  websiteUrl: string;
  amountMinor: number;
  purchaseOrderId: string;
  purchaseOrderName: string;
  customerName: string;
  customerPhone: string;
}) {
  if (
    !Number.isSafeInteger(params.amountMinor) ||
    params.amountMinor <= 0
  ) {
    throw new Error(
      "Khalti amount must be a positive integer in paisa."
    );
  }

  const normalizedPhone = params.customerPhone.replace(
    /^\+977/,
    ""
  );

  if (!/^9[78]\d{8}$/.test(normalizedPhone)) {
    throw new Error("Invalid Nepali mobile number.");
  }

  return {
    return_url: params.returnUrl,
    website_url: params.websiteUrl,
    amount: params.amountMinor,
    purchase_order_id: params.purchaseOrderId,
    purchase_order_name: params.purchaseOrderName,
    customer_info: {
      name: params.customerName,
      phone: normalizedPhone,
    },
  };
}
