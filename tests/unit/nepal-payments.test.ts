import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildKhaltiV2InitiatePayload,
  signEsewaV2Request,
  verifyEsewaV2Callback,
} from "@/features/payments/nepal-gateways";

describe("Nepal Payment Gateways (eSewa v2 HMAC & Khalti v2)", () => {
  const sandboxSecret = "8gBm/:&EnhH.1/q";

  it("signs eSewa v2 request payloads and verifies authentic callbacks", () => {
    const signed = signEsewaV2Request({
      totalAmountMinor: 150_000, // NPR 1,500.00
      transactionUuid: "SC-261125-9001",
      productCode: "EPAYTEST",
      secretKey: sandboxSecret,
    });

    expect(signed.totalAmountStr).toBe("1500.00");

    const callbackPayload: Record<string, unknown> = {
      transaction_code: "0008XYZ",
      status: "COMPLETE",
      total_amount: "1500.00",
      transaction_uuid: "SC-261125-9001",
      product_code: "EPAYTEST",
      signed_field_names: "transaction_code,status,total_amount,transaction_uuid,product_code",
    };

    const msg =
      "transaction_code=0008XYZ,status=COMPLETE,total_amount=1500.00,transaction_uuid=SC-261125-9001,product_code=EPAYTEST";
    callbackPayload.signature = crypto
      .createHmac("sha256", sandboxSecret)
      .update(msg)
      .digest("base64");

    expect(
      verifyEsewaV2Callback({
        payload: callbackPayload,
        secretKey: sandboxSecret,
      }).valid
    ).toBe(true);

    // Tampered amount must fail signature verification
    expect(
      verifyEsewaV2Callback({
        payload: { ...callbackPayload, total_amount: "15.00" },
        secretKey: sandboxSecret,
      }).valid
    ).toBe(false);
  });

  it("constructs Khalti v2 payload using integer paisa and normalized phone", () => {
    const khalti = buildKhaltiV2InitiatePayload({
      returnUrl: "https://sajilocommerce.com/checkout/callback",
      websiteUrl: "https://sajilocommerce.com",
      amountMinor: 245_000,
      purchaseOrderId: "SC-261125-9002",
      purchaseOrderName: "Himalayan Wool Shawl",
      customerName: "Sita Gurung",
      customerPhone: "+9779841234567",
    });

    expect(khalti.amount).toBe(245_000);
    expect(khalti.customer_info.phone).toBe("9841234567");
  });
});
