import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeNepalPhone } from "@/lib/currency/npr";

export const upsertCustomerSchema = z.object({
  full_name: z.string().trim().min(1, "Customer name is required.").max(120),
  phone: z.string().trim().min(7, "Enter a valid Nepali mobile number."),
  email: z.string().trim().email().optional().or(z.literal("")),
  instagram_handle: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  cod_risk_flag: z.boolean().optional(),
  address: z
    .object({
      province: z.string().trim().max(100).optional(),
      district: z.string().trim().max(100).optional(),
      city: z.string().trim().max(100).optional(),
      street_address: z.string().trim().min(2).max(240),
      landmark: z.string().trim().max(160).optional(),
    })
    .optional(),
});

export async function listBusinessCustomers(params: {
  businessId: string;
  query?: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  let req = serviceClient
    .from("customers")
    .select(
      `
      id,
      full_name,
      phone_e164,
      email,
      instagram_handle,
      cod_risk_flag,
      total_orders,
      delivered_orders,
      returned_orders,
      total_spent_minor,
      last_order_at,
      customer_addresses (
        id,
        province,
        district,
        city,
        street_address,
        landmark,
        is_default
      )
    `
    )
    .eq("business_id", params.businessId)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.query && params.query.trim().length > 0) {
    const q = params.query.trim();
    const maybePhone = normalizeNepalPhone(q);
    if (maybePhone) {
      req = req.eq("phone_e164", maybePhone);
    } else {
      req = req.or(`full_name.ilike.%${q}%,phone_e164.ilike.%${q}%,instagram_handle.ilike.%${q}%`);
    }
  }

  const { data } = await req;
  return data ?? [];
}

/**
 * Finds or creates a customer deduplicated by normalized +977 phone_e164 per business,
 * updating name/Instagram handle and optionally saving a default delivery address.
 */
export async function findOrCreateCustomerByPhone(params: {
  businessId: string;
  fullName: string;
  rawPhone: string;
  email?: string | null;
  instagramHandle?: string | null;
  notes?: string | null;
  address?: {
    province?: string;
    district?: string;
    city?: string;
    street_address: string;
    landmark?: string;
  };
}) {
  const phoneE164 = normalizeNepalPhone(params.rawPhone);
  if (!phoneE164) {
    return {
      error: {
        status: 422,
        code: "INVALID_PHONE",
        message: "Enter a valid 10-digit Nepali mobile number (e.g. 9841234567).",
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: existing } = await serviceClient
    .from("customers")
    .select("id, full_name, phone_e164, email, instagram_handle, cod_risk_flag, total_orders, total_spent_minor")
    .eq("business_id", params.businessId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  let customerId: string;

  if (existing) {
    customerId = existing.id;
    const patch: Record<string, unknown> = {
      full_name: params.fullName.trim() || existing.full_name,
    };
    if (params.email) patch.email = params.email.trim();
    if (params.instagramHandle) {
      patch.instagram_handle = params.instagramHandle.trim().replace(/^@/, "");
    }
    if (params.notes) patch.notes = params.notes.trim();

    await serviceClient
      .from("customers")
      .update(patch)
      .eq("id", customerId)
      .eq("business_id", params.businessId);
  } else {
    const { data: created, error } = await serviceClient
      .from("customers")
      .insert({
        business_id: params.businessId,
        full_name: params.fullName.trim(),
        phone_e164: phoneE164,
        email: params.email?.trim() || null,
        instagram_handle: params.instagramHandle?.trim().replace(/^@/, "") || null,
        notes: params.notes?.trim() || null,
      })
      .select("id")
      .single();

    if (error || !created) {
      return {
        error: {
          status: 500,
          code: "CUSTOMER_CREATE_FAILED",
          message: "Could not save customer profile.",
        },
      };
    }
    customerId = created.id;
  }

  if (params.address && params.address.street_address.trim().length >= 2) {
    await serviceClient.from("customer_addresses").insert({
      business_id: params.businessId,
      customer_id: customerId,
      province: params.address.province || null,
      district: params.address.district || null,
      city: params.address.city || null,
      street_address: params.address.street_address.trim(),
      landmark: params.address.landmark || null,
      is_default: true,
    });
  }

  const { data: customer } = await serviceClient
    .from("customers")
    .select("id, full_name, phone_e164, email, instagram_handle, cod_risk_flag, total_orders, delivered_orders, returned_orders, total_spent_minor")
    .eq("id", customerId)
    .single();

  return { data: customer };
}
