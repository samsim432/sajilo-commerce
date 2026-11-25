-- Migration 007: Nepal Shipping Zones, Courier Shipments & COD Cash Reconciliation
-- Product: Sajilo Commerce (Phase 6 - Day 6)

-- 1. Shipping Zones (Kathmandu Valley, Outside Valley Cities, Remote Districts)
CREATE TABLE public.shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  zone_code TEXT NOT NULL CHECK (
    zone_code IN ('inside_valley', 'outside_valley', 'remote_district', 'custom')
  ),
  districts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shipping_zones_business_name UNIQUE (business_id, name)
);

CREATE INDEX idx_shipping_zones_business ON public.shipping_zones (business_id, is_active);

CREATE TRIGGER trg_shipping_zones_updated_at
  BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Shipping Rates per Zone (Paisa Precision + Free Shipping Threshold)
CREATE TABLE public.shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Standard Delivery',
  flat_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (flat_fee_minor >= 0),
  free_shipping_min_order_minor BIGINT CHECK (
    free_shipping_min_order_minor IS NULL OR free_shipping_min_order_minor >= 0
  ),
  estimated_days_min INTEGER NOT NULL DEFAULT 1 CHECK (estimated_days_min >= 0),
  estimated_days_max INTEGER NOT NULL DEFAULT 3 CHECK (estimated_days_max >= estimated_days_min),
  cod_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipping_rates_zone ON public.shipping_rates (business_id, zone_id, is_active);

-- 3. Courier Shipments & Tracking
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  courier_provider TEXT NOT NULL DEFAULT 'self_rider' CHECK (
    courier_provider IN ('pathao', 'ncm', 'sundar', 'upakar', 'self_rider', 'custom')
  ),
  courier_name_custom TEXT,
  tracking_number TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  status TEXT NOT NULL DEFAULT 'label_created' CHECK (
    status IN (
      'label_created',
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'failed_attempt',
      'returned_to_origin'
    )
  ),
  is_cod BOOLEAN NOT NULL DEFAULT FALSE,
  cod_expected_minor BIGINT NOT NULL DEFAULT 0 CHECK (cod_expected_minor >= 0),
  cod_collected_minor BIGINT NOT NULL DEFAULT 0 CHECK (cod_collected_minor >= 0),
  cod_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipments_business_status ON public.shipments (business_id, status, created_at DESC);
CREATE INDEX idx_shipments_business_order ON public.shipments (business_id, order_id);
CREATE INDEX idx_shipments_unreconciled_cod
  ON public.shipments (business_id, courier_provider, cod_reconciled)
  WHERE is_cod = TRUE;

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. COD Cash Reconciliation Batches (Courier Payout Settlement)
CREATE TABLE public.cod_reconciliation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  batch_reference TEXT NOT NULL,
  courier_provider TEXT NOT NULL,
  expected_total_minor BIGINT NOT NULL CHECK (expected_total_minor >= 0),
  remitted_total_minor BIGINT NOT NULL CHECK (remitted_total_minor >= 0),
  variance_minor BIGINT NOT NULL, -- remitted_total_minor - expected_total_minor
  status TEXT NOT NULL DEFAULT 'reconciled' CHECK (
    status IN ('draft', 'reconciled', 'disputed')
  ),
  notes TEXT,
  reconciled_by UUID,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cod_batches_business_ref UNIQUE (business_id, batch_reference)
);

CREATE INDEX idx_cod_batches_business ON public.cod_reconciliation_batches (business_id, created_at DESC);

CREATE TABLE public.cod_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.cod_reconciliation_batches(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  expected_minor BIGINT NOT NULL CHECK (expected_minor >= 0),
  collected_minor BIGINT NOT NULL CHECK (collected_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cod_recon_item_shipment UNIQUE (shipment_id)
);

-- ============================================================================
-- Enable & Force Row Level Security on All Shipping & COD Tables
-- ============================================================================
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_zones FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cod_reconciliation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_reconciliation_batches FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cod_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_reconciliation_items FORCE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY shipping_zones_select_tenant
  ON public.shipping_zones FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY shipping_zones_write_admin
  ON public.shipping_zones FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY shipping_rates_select_tenant
  ON public.shipping_rates FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY shipping_rates_write_admin
  ON public.shipping_rates FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager']));

CREATE POLICY shipments_select_tenant
  ON public.shipments FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY shipments_write_ops
  ON public.shipments FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'warehouse']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'warehouse']));

CREATE POLICY cod_batches_select_tenant
  ON public.cod_reconciliation_batches FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY cod_batches_write_finance
  ON public.cod_reconciliation_batches FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant']));

CREATE POLICY cod_items_select_tenant
  ON public.cod_reconciliation_items FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY cod_items_write_finance
  ON public.cod_reconciliation_items FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant']));
