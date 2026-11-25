import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  assertNumericQuota,
  PlanQuotaExceededError,
} from "@/features/subscriptions/entitlements";
import {
  findDuplicateSkus,
  optionAxisSchema,
  slugifyProductTitle,
} from "@/features/products/variant-matrix";

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).default("Default"),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  barcode: z.string().trim().max(64).optional().nullable(),
  option_values: z.record(z.string(), z.string()).default({}),
  price_minor: z.number().int().min(0, "Price cannot be negative"),
  compare_at_price_minor: z.number().int().min(0).optional().nullable(),
  cost_price_minor: z.number().int().min(0).optional().nullable(),
  weight_grams: z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(3),
  is_active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

export const mediaInputSchema = z.object({
  storage_path: z.string().min(1),
  public_url: z.string().url(),
  alt_text: z.string().max(160).optional().nullable(),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byte_size: z.number().int().positive().max(5242880),
  position: z.number().int().min(0).default(0),
});

export const upsertProductSchema = z.object({
  title: z.string().trim().min(1, "Product title is required").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/)
    .optional(),
  category_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  has_variants: z.boolean().default(false),
  option_axes: z.array(optionAxisSchema).max(3).default([]),
  track_inventory: z.boolean().default(true),
  tax_applicable: z.boolean().default(false),
  seo_title: z.string().trim().max(120).optional().nullable(),
  seo_description: z.string().trim().max(260).optional().nullable(),
  variants: z
    .array(variantInputSchema)
    .min(1, "At least one sellable variant is required")
    .max(100),
  media: z.array(mediaInputSchema).max(10).default([]),
});

export type UpsertProductInput = z.infer<typeof upsertProductSchema>;

export async function listBusinessProducts(params: {
  businessId: string;
  query?: string;
  status?: string;
  categoryId?: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  let req = serviceClient
    .from("products")
    .select(
      `
      id,
      title,
      slug,
      status,
      has_variants,
      option_axes,
      track_inventory,
      created_at,
      updated_at,
      categories:category_id ( id, name, slug ),
      product_variants (
        id,
        title,
        sku,
        option_values,
        price_minor,
        compare_at_price_minor,
        cost_price_minor,
        weight_grams,
        low_stock_threshold,
        is_active,
        position
      ),
      product_media (
        id,
        public_url,
        alt_text,
        position
      )
    `
    )
    .eq("business_id", params.businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params.status && ["draft", "active", "archived"].includes(params.status)) {
    req = req.eq("status", params.status);
  }
  if (params.categoryId) {
    req = req.eq("category_id", params.categoryId);
  }
  if (params.query && params.query.trim().length > 0) {
    req = req.ilike("title", `%${params.query.trim()}%`);
  }

  const { data, error } = await req;
  if (error) {
    throw new Error("Failed to load business products.");
  }

  return data ?? [];
}

export async function getBusinessProductById(businessId: string, productId: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("products")
    .select(
      `
      id,
      title,
      slug,
      category_id,
      description,
      status,
      has_variants,
      option_axes,
      track_inventory,
      tax_applicable,
      seo_title,
      seo_description,
      created_at,
      updated_at,
      product_variants (
        id,
        title,
        sku,
        barcode,
        option_values,
        price_minor,
        compare_at_price_minor,
        cost_price_minor,
        weight_grams,
        low_stock_threshold,
        is_active,
        position
      ),
      product_media (
        id,
        storage_path,
        public_url,
        alt_text,
        mime_type,
        byte_size,
        position
      )
    `
    )
    .eq("business_id", businessId)
    .eq("id", productId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function createBusinessProduct(params: {
  businessId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = upsertProductSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid product payload.",
      },
    };
  }

  const input = parsed.data;
  const duplicateSkus = findDuplicateSkus(input.variants.map((v) => v.sku));
  if (duplicateSkus.length > 0) {
    return {
      error: {
        status: 422,
        code: "DUPLICATE_SKU_IN_PAYLOAD",
        message: `Duplicate SKU(s) in product variants: ${duplicateSkus.join(", ")}`,
      },
    };
  }

  try {
    await assertNumericQuota(params.businessId, "max_products");
  } catch (err) {
    if (err instanceof PlanQuotaExceededError) {
      return {
        error: {
          status: err.status,
          code: err.code,
          message: err.message,
        },
      };
    }
    throw err;
  }

  const serviceClient = createSupabaseServiceClient();
  const baseSlug = input.slug || slugifyProductTitle(input.title);
  const candidateSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;

  const { data: product, error: prodError } = await serviceClient
    .from("products")
    .insert({
      business_id: params.businessId,
      category_id: input.category_id ?? null,
      title: input.title,
      slug: candidateSlug,
      description: input.description ?? null,
      status: input.status,
      has_variants: input.has_variants || input.variants.length > 1,
      option_axes: input.option_axes,
      track_inventory: input.track_inventory,
      tax_applicable: input.tax_applicable,
      seo_title: input.seo_title ?? null,
      seo_description: input.seo_description ?? null,
    })
    .select("id, title, slug, status")
    .single();

  if (prodError || !product) {
    return {
      error: {
        status: 500,
        code: "PRODUCT_CREATE_FAILED",
        message: "Unable to create product record.",
      },
    };
  }

  const variantRows = input.variants.map((v, idx) => ({
    business_id: params.businessId,
    product_id: product.id,
    title: v.title,
    sku: v.sku.trim().toUpperCase(),
    barcode: v.barcode ?? null,
    option_values: v.option_values,
    price_minor: v.price_minor,
    compare_at_price_minor: v.compare_at_price_minor ?? null,
    cost_price_minor: v.cost_price_minor ?? null,
    weight_grams: v.weight_grams,
    low_stock_threshold: v.low_stock_threshold,
    is_active: v.is_active,
    position: idx,
  }));

  const { error: varError } = await serviceClient
    .from("product_variants")
    .insert(variantRows);

  if (varError) {
    await serviceClient.from("products").delete().eq("id", product.id);
    const isDuplicateSku = varError.code === "23505";
    return {
      error: {
        status: isDuplicateSku ? 409 : 500,
        code: isDuplicateSku ? "SKU_ALREADY_EXISTS" : "VARIANT_CREATE_FAILED",
        message: isDuplicateSku
          ? "One or more SKUs already belong to another product in your store."
          : "Could not save product variants.",
      },
    };
  }

  if (input.media.length > 0) {
    await serviceClient.from("product_media").insert(
      input.media.map((m, idx) => ({
        business_id: params.businessId,
        product_id: product.id,
        storage_path: m.storage_path,
        public_url: m.public_url,
        alt_text: m.alt_text ?? input.title,
        mime_type: m.mime_type,
        byte_size: m.byte_size,
        position: idx,
      }))
    );
  }

  await serviceClient.from("audit_logs").insert({
    business_id: params.businessId,
    actor_type: "merchant_user",
    actor_id: params.actorUserId,
    action: "product.created",
    resource_type: "product",
    resource_id: product.id,
    metadata: {
      title: product.title,
      variant_count: variantRows.length,
    },
  });

  const fullProduct = await getBusinessProductById(params.businessId, product.id);
  return { data: fullProduct };
}

export async function updateBusinessProduct(params: {
  businessId: string;
  productId: string;
  actorUserId: string;
  rawInput: unknown;
}) {
  const parsed = upsertProductSchema.safeParse(params.rawInput);
  if (!parsed.success) {
    return {
      error: {
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid product update payload.",
      },
    };
  }

  const input = parsed.data;
  const duplicateSkus = findDuplicateSkus(input.variants.map((v) => v.sku));
  if (duplicateSkus.length > 0) {
    return {
      error: {
        status: 422,
        code: "DUPLICATE_SKU_IN_PAYLOAD",
        message: `Duplicate SKU(s) in product variants: ${duplicateSkus.join(", ")}`,
      },
    };
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: existing } = await serviceClient
    .from("products")
    .select("id")
    .eq("business_id", params.businessId)
    .eq("id", params.productId)
    .is("deleted_at", null)
    .single();

  if (!existing) {
    return {
      error: {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Product not found.",
      },
    };
  }

  const { error: prodUpdateErr } = await serviceClient
    .from("products")
    .update({
      category_id: input.category_id ?? null,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      has_variants: input.has_variants || input.variants.length > 1,
      option_axes: input.option_axes,
      track_inventory: input.track_inventory,
      tax_applicable: input.tax_applicable,
      seo_title: input.seo_title ?? null,
      seo_description: input.seo_description ?? null,
    })
    .eq("id", params.productId)
    .eq("business_id", params.businessId);

  if (prodUpdateErr) {
    return {
      error: {
        status: 500,
        code: "PRODUCT_UPDATE_FAILED",
        message: "Failed to update product details.",
      },
    };
  }

  // Upsert retained variants and remove deleted ones
  const keptIds = input.variants
    .map((v) => v.id)
    .filter((id): id is string => Boolean(id));

  if (keptIds.length > 0) {
    await serviceClient
      .from("product_variants")
      .delete()
      .eq("business_id", params.businessId)
      .eq("product_id", params.productId)
      .not("id", "in", `(${keptIds.join(",")})`);
  } else {
    await serviceClient
      .from("product_variants")
      .delete()
      .eq("business_id", params.businessId)
      .eq("product_id", params.productId);
  }

  for (let idx = 0; idx < input.variants.length; idx++) {
    const v = input.variants[idx]!;
    const variantRecord = {
      business_id: params.businessId,
      product_id: params.productId,
      title: v.title,
      sku: v.sku.trim().toUpperCase(),
      barcode: v.barcode ?? null,
      option_values: v.option_values,
      price_minor: v.price_minor,
      compare_at_price_minor: v.compare_at_price_minor ?? null,
      cost_price_minor: v.cost_price_minor ?? null,
      weight_grams: v.weight_grams,
      low_stock_threshold: v.low_stock_threshold,
      is_active: v.is_active,
      position: idx,
    };

    if (v.id) {
      const { error: uErr } = await serviceClient
        .from("product_variants")
        .update(variantRecord)
        .eq("id", v.id)
        .eq("business_id", params.businessId);
      if (uErr?.code === "23505") {
        return {
          error: {
            status: 409,
            code: "SKU_ALREADY_EXISTS",
            message: `SKU ${variantRecord.sku} is already assigned to another product.`,
          },
        };
      }
    } else {
      const { error: iErr } = await serviceClient
        .from("product_variants")
        .insert(variantRecord);
      if (iErr?.code === "23505") {
        return {
          error: {
            status: 409,
            code: "SKU_ALREADY_EXISTS",
            message: `SKU ${variantRecord.sku} is already assigned to another product.`,
          },
        };
      }
    }
  }

  // Replace product media references cleanly
  await serviceClient
    .from("product_media")
    .delete()
    .eq("business_id", params.businessId)
    .eq("product_id", params.productId);

  if (input.media.length > 0) {
    await serviceClient.from("product_media").insert(
      input.media.map((m, idx) => ({
        business_id: params.businessId,
        product_id: params.productId,
        storage_path: m.storage_path,
        public_url: m.public_url,
        alt_text: m.alt_text ?? input.title,
        mime_type: m.mime_type,
        byte_size: m.byte_size,
        position: idx,
      }))
    );
  }

  await serviceClient.from("audit_logs").insert({
    business_id: params.businessId,
    actor_type: "merchant_user",
    actor_id: params.actorUserId,
    action: "product.updated",
    resource_type: "product",
    resource_id: params.productId,
    metadata: { title: input.title, variant_count: input.variants.length },
  });

  const fullProduct = await getBusinessProductById(params.businessId, params.productId);
  return { data: fullProduct };
}
