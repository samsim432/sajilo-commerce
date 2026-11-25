-- Migration 005: Atomic Multi-Location Inventory, Append-Only Ledger, Stock Transfers & RLS
-- Product: Sajilo Commerce (Phase 4 - Day 4)

-- 1. Stock Levels per Location & Variant
CREATE TABLE public.stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  on_hand_quantity INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stock_levels_biz_loc_var UNIQUE (business_id, location_id, variant_id),
  CONSTRAINT chk_stock_reserved_lte_on_hand CHECK (reserved_quantity <= on_hand_quantity)
);

CREATE INDEX idx_stock_levels_biz_var ON public.stock_levels (business_id, variant_id);
CREATE INDEX idx_stock_levels_biz_loc ON public.stock_levels (business_id, location_id);

CREATE TRIGGER trg_stock_levels_updated_at
  BEFORE UPDATE ON public.stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Immutable Append-Only Stock Movement Ledger
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'initial_seed',
      'manual_adjustment',
      'order_reserve',
      'order_release',
      'shipment_deduct',
      'transfer_out',
      'transfer_in',
      'return_restock'
    )
  ),
  -- Signed delta applied to on_hand_quantity (0 for pure reserve/release events)
  quantity_delta INTEGER NOT NULL,
  -- Signed delta applied to reserved_quantity
  reserved_delta INTEGER NOT NULL DEFAULT 0,
  on_hand_after INTEGER NOT NULL CHECK (on_hand_after >= 0),
  reserved_after INTEGER NOT NULL CHECK (reserved_after >= 0),
  reason TEXT,
  reference_type TEXT,
  reference_id UUID,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_biz_created ON public.stock_movements (business_id, created_at DESC);
CREATE INDEX idx_stock_movements_biz_var ON public.stock_movements (business_id, variant_id, created_at DESC);
CREATE INDEX idx_stock_movements_biz_loc ON public.stock_movements (business_id, location_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_stock_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is an immutable ledger and cannot be updated or deleted';
END;
$$;

CREATE TRIGGER trg_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_stock_movement_mutation();

-- 3. Inter-Location Stock Transfers
CREATE TABLE public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  destination_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transfer_distinct_locations CHECK (source_location_id <> destination_location_id)
);

CREATE INDEX idx_stock_transfers_biz_status ON public.stock_transfers (business_id, status, created_at DESC);

CREATE TRIGGER trg_stock_transfers_updated_at
  BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_transfer_items_transfer ON public.stock_transfer_items (transfer_id);

-- ============================================================================
-- Atomic Row-Locked Reservation & Release Functions (Deadlock-Free Ordering)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reserve_stock_atomic(
  p_business_id UUID,
  p_location_id UUID,
  p_items JSONB, -- [{"variant_id":"...","quantity":1}]
  p_reference_type TEXT DEFAULT 'order',
  p_reference_id UUID DEFAULT NULL,
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
  v_available INTEGER;
  v_new_reserved INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required for stock reservation'
      USING ERRCODE = '22023';
  END IF;

  -- Lock stock_levels rows in deterministic variant_id order to prevent deadlocks
  FOR v_item IN
    SELECT
      (elem ->> 'variant_id')::UUID AS variant_id,
      SUM((elem ->> 'quantity')::INTEGER) AS requested_qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY (elem ->> 'variant_id')::UUID
    ORDER BY (elem ->> 'variant_id')::UUID ASC
  LOOP
    IF v_item.requested_qty IS NULL OR v_item.requested_qty <= 0 THEN
      RAISE EXCEPTION 'Reservation quantity must be positive'
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_level
    FROM public.stock_levels
    WHERE business_id = p_business_id
      AND location_id = p_location_id
      AND variant_id = v_item.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: no stock level found for variant %', v_item.variant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_available := v_level.on_hand_quantity - v_level.reserved_quantity;
    IF v_available < v_item.requested_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: requested %, available % for variant %',
        v_item.requested_qty, v_available, v_item.variant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_new_reserved := v_level.reserved_quantity + v_item.requested_qty;

    UPDATE public.stock_levels
    SET reserved_quantity = v_new_reserved
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
      'order_reserve',
      0,
      v_item.requested_qty,
      v_level.on_hand_quantity,
      v_new_reserved,
      'Order stock reservation',
      p_reference_type,
      p_reference_id,
      p_actor_id
    );
  END LOOP;

  RETURN jsonb_build_object('reserved', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reserved_stock_atomic(
  p_business_id UUID,
  p_location_id UUID,
  p_items JSONB,
  p_reference_type TEXT DEFAULT 'order',
  p_reference_id UUID DEFAULT NULL,
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
  v_release_qty INTEGER;
  v_new_reserved INTEGER;
BEGIN
  FOR v_item IN
    SELECT
      (elem ->> 'variant_id')::UUID AS variant_id,
      SUM((elem ->> 'quantity')::INTEGER) AS requested_qty
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

    IF FOUND AND v_level.reserved_quantity > 0 THEN
      v_release_qty := LEAST(v_level.reserved_quantity, GREATEST(0, v_item.requested_qty));
      v_new_reserved := v_level.reserved_quantity - v_release_qty;

      UPDATE public.stock_levels
      SET reserved_quantity = v_new_reserved
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
        'order_release',
        0,
        -v_release_qty,
        v_level.on_hand_quantity,
        v_new_reserved,
        'Released reserved order stock',
        p_reference_type,
        p_reference_id,
        p_actor_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('released', TRUE);
END;
$$;

-- ============================================================================
-- Enable & Force Row Level Security on All Inventory Tables
-- ============================================================================
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items FORCE ROW LEVEL SECURITY;

-- stock_levels: readable by members with inventory:read; mutable by owner/admin/manager/warehouse
CREATE POLICY stock_levels_select_tenant
  ON public.stock_levels FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'accountant', 'warehouse'])
  );

CREATE POLICY stock_levels_write_ops
  ON public.stock_levels FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  );

-- stock_movements: append-only ledger
CREATE POLICY stock_movements_select_tenant
  ON public.stock_movements FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'accountant', 'warehouse'])
  );

CREATE POLICY stock_movements_insert_ops
  ON public.stock_movements FOR INSERT
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  );

-- stock_transfers & items
CREATE POLICY stock_transfers_select_tenant
  ON public.stock_transfers FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY stock_transfers_write_ops
  ON public.stock_transfers FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  );

CREATE POLICY stock_transfer_items_select_tenant
  ON public.stock_transfer_items FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY stock_transfer_items_write_ops
  ON public.stock_transfer_items FOR ALL
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'warehouse'])
  );
