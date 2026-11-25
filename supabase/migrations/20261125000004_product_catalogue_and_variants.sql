-- Migration 004: Product Catalogue, Multi-Variant Engine, Media & Forced RLS
-- Product: Sajilo Commerce (Phase 3 - Day 3)

-- 1. Product Categories (Per-Tenant Hierarchical or Flat Categories)
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_categories_business_slug UNIQUE (business_id, slug)
);

CREATE INDEX idx_categories_business_sort ON public.categories (business_id, sort_order, name);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Products (Base Catalogue Entity with up to 3 Option Axes)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 160),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$'),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  has_variants BOOLEAN NOT NULL DEFAULT FALSE,
  -- Up to 3 option axes, e.g. [{"name":"Size","values":["S","M","L"]},{"name":"Colour","values":["Black","Ivory"]}]
  option_axes JSONB NOT NULL DEFAULT '[]'::jsonb,
  track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  tax_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  seo_title TEXT,
  seo_description TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_business_slug UNIQUE (business_id, slug)
);

CREATE INDEX idx_products_business_status ON public.products (business_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_products_business_category ON public.products (business_id, category_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Product Variants (Every Product Has >= 1 Sellable Variant; Prices in Integer Paisa)
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Default',
  sku TEXT NOT NULL CHECK (char_length(trim(sku)) BETWEEN 1 AND 64),
  barcode TEXT,
  -- Option selection map matching product.option_axes, e.g. {"Size":"M","Colour":"Black"}
  option_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  compare_at_price_minor BIGINT CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= 0),
  cost_price_minor BIGINT CHECK (cost_price_minor IS NULL OR cost_price_minor >= 0),
  weight_grams INTEGER NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_variants_business_sku UNIQUE (business_id, sku)
);

CREATE INDEX idx_product_variants_product ON public.product_variants (business_id, product_id, position);
CREATE INDEX idx_product_variants_sku_lookup ON public.product_variants (business_id, sku);

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Product Media (Validated Images Stored in Supabase Storage)
CREATE TABLE public.product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  alt_text TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_media_product_pos ON public.product_media (business_id, product_id, position);

-- ============================================================================
-- Enable & Force Row Level Security on All Catalogue Tables
-- ============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies: categories
-- ============================================================================
CREATE POLICY categories_select_tenant
  ON public.categories FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY categories_write_managers
  ON public.categories FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

-- ============================================================================
-- RLS Policies: products
-- ============================================================================
CREATE POLICY products_select_tenant
  ON public.products FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY products_write_managers
  ON public.products FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

-- ============================================================================
-- RLS Policies: product_variants
-- ============================================================================
CREATE POLICY product_variants_select_tenant
  ON public.product_variants FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY product_variants_write_managers
  ON public.product_variants FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

-- ============================================================================
-- RLS Policies: product_media
-- ============================================================================
CREATE POLICY product_media_select_tenant
  ON public.product_media FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY product_media_write_managers
  ON public.product_media FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

-- ============================================================================
-- Storage Bucket for Validated Product Media (Public Read, Server-Gated Upload)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-media',
  'product-media',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
