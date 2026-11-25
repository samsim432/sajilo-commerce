-- Migration 006: Customer CRM, Unified Orders, Immutable Order Items, Events & Idempotency
-- Product: Sajilo Commerce (Phase 5 - Day 5)

-- 1. Customers (Deduplicated by Normalized +977 Phone per Business)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 1 AND 120),
  phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+9779[6-8][0-9]{8}$'),
  email TEXT,
  instagram_handle TEXT,
  facebook_profile TEXT,
  notes TEXT,
  cod_risk_flag BOOLEAN NOT NULL DEFAULT FALSE,
  total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  delivered_orders INTEGER NOT NULL DEFAULT 0 CHECK (delivered_orders >= 0),
  returned_orders INTEGER NOT NULL DEFAULT 0 CHECK (returned_orders >= 0),
  total_spent_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_spent_minor >= 0),
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customers_business_phone UNIQUE (business_id, phone_e164)
);

CREATE INDEX idx_customers_business_name ON public.customers (business_id, full_name);
CREATE INDEX idx_customers_business_recent ON public.customers (business_id, last_order_at DESC NULLS LAST);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Saved Customer Delivery Addresses (Nepal Province/District/Municipality/Landmark)
CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  province TEXT,
  district TEXT,
  city TEXT,
  ward_no TEXT,
  street_address TEXT NOT NULL,
  landmark TEXT,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses (business_id, customer_id);

-- 3. Unified Orders (Website + Social DM + Manual Phone Orders)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (
    channel IN ('website', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'manual_phone')
  ),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (
    status IN (
      'draft',
      'pending_payment',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'return_requested',
      'returned',
      'refunded'
    )
  ),
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (
    payment_method IN ('cod', 'esewa', 'khalti', 'fonepay', 'connectips', 'bank_transfer', 'cash')
  ),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN ('unpaid', 'pending_verification', 'paid', 'partially_paid', 'refunded')
  ),
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
  shipping_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (shipping_fee_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  shipping_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_note TEXT,
  internal_note TEXT,
  stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orders_business_number UNIQUE (business_id, order_number)
);

CREATE INDEX idx_orders_business_created ON public.orders (business_id, created_at DESC);
CREATE INDEX idx_orders_business_status ON public.orders (business_id, status, created_at DESC);
CREATE INDEX idx_orders_business_customer ON public.orders (business_id, customer_id, created_at DESC);
CREATE INDEX idx_orders_business_channel ON public.orders (business_id, channel, created_at DESC);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Order Line Items (Snapshotted Title, SKU, Variant & Paisa Unit Price)
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_title TEXT NOT NULL,
  variant_title TEXT NOT NULL DEFAULT 'Default',
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON public.order_items (business_id, order_id);

-- 5. Append-Only Order Lifecycle & Audit Timeline
CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_created ON public.order_events (business_id, order_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.prevent_order_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'order_events is append-only and cannot be updated or deleted';
END;
$$;

CREATE TRIGGER trg_order_events_immutable
  BEFORE UPDATE OR DELETE ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_event_mutation();

-- 6. Idempotency Keys (24h Replay Safety for Checkout & Manual Orders)
CREATE TABLE public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_idempotency_scope_key UNIQUE (scope_key, idempotency_key)
);

CREATE INDEX idx_idempotency_expires ON public.idempotency_keys (expires_at);

-- 7. Atomic Shipment Stock Deduction Helper (Converts Reserved -> Deducted On Hand)
CREATE OR REPLACE FUNCTION public.deduct_shipped_stock_atomic(
  p_business_id UUID,
  p_location_id UUID,
  p_items JSONB,
  p_order_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_level RECORD;
  v_deduct_qty INTEGER;
  v_release_reserved INTEGER;
  v_new_on_hand INTEGER;
  v_new_reserved INTEGER;
BEGIN
  FOR v_item IN
    SELECT
      (elem ->> 'variant_id')::UUID AS variant_id,
      SUM((elem ->> 'quantity')::INTEGER) AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem ->> 'variant_id')::UUID
    ORDER BY (elem ->> 'variant_id')::UUID ASC
  LOOP
    SELECT *
    INTO v_level
    FROM public.stock_levels
    WHERE business_id = p_business_id
      AND location_id = p_location_id
      AND variant_id = v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND OR v_level.on_hand_quantity < v_item.qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK_FOR_SHIPMENT: variant %', v_item.variant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_deduct_qty := v_item.qty;
    v_release_reserved := LEAST(v_level.reserved_quantity, v_deduct_qty);
    v_new_on_hand := v_level.on_hand_quantity - v_deduct_qty;
    v_new_reserved := v_level.reserved_quantity - v_release_reserved;

    UPDATE public.stock_levels
    SET on_hand_quantity = v_new_on_hand,
        reserved_quantity = v_new_reserved
    WHERE id = v_level.id;

    INSERT INTO public.stock_movements (
      business_id,
      location_id,
      variant_id,
      movement_type,
      quantity_delta,
      reserved_delta,
      on_hand_after,
      reserved_after,
      reason,
      reference_type,
      reference_id,
      actor_id
    )
    VALUES (
      p_business_id,
      p_location_id,
      v_item.variant_id,
      'shipment_deduct',
      -v_deduct_qty,
      -v_release_reserved,
      v_new_on_hand,
      v_new_reserved,
      'Order shipped stock deduction',
      'order',
      p_order_id,
      p_actor_id
    );
  END LOOP;

  RETURN jsonb_build_object('deducted', TRUE);
END;
$$;

-- ============================================================================
-- Enable & Force Row Level Security on All CRM & Order Tables
-- ============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY customers_select_tenant
  ON public.customers FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY customers_write_ops
  ON public.customers FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff']));

CREATE POLICY customer_addresses_select_tenant
  ON public.customer_addresses FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY customer_addresses_write_ops
  ON public.customer_addresses FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff']));

CREATE POLICY orders_select_tenant
  ON public.orders FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY orders_write_ops
  ON public.orders FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'warehouse']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'warehouse']));

CREATE POLICY order_items_select_tenant
  ON public.order_items FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY order_items_insert_ops
  ON public.order_items FOR INSERT
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff']));

CREATE POLICY order_events_select_tenant
  ON public.order_events FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY order_events_insert_tenant
  ON public.order_events FOR INSERT
  WITH CHECK (business_id = public.current_business_id() AND public.has_active_membership(business_id));
