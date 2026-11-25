-- Migration 008: Nepal Payment Gateways (eSewa, Khalti, Fonepay), Webhook Deduplication & Finance Ledger
-- Product: Sajilo Commerce (Phase 7 - Day 7)

-- 1. Merchant Payment Gateway Configurations
CREATE TABLE public.merchant_payment_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL CHECK (
    gateway IN ('esewa', 'khalti', 'fonepay', 'connectips', 'bank_transfer', 'cod')
  ),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  merchant_identifier TEXT, -- e.g. eSewa product_code (EPAYTEST), Fonepay merchant code, or Bank A/C
  secret_key_ciphertext TEXT, -- Encrypted or vault reference; never returned in plaintext to client
  account_title TEXT,
  qr_image_url TEXT,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_merchant_payment_config UNIQUE (business_id, gateway)
);

CREATE INDEX idx_merchant_payment_configs_biz ON public.merchant_payment_configs (business_id, is_enabled);

CREATE TRIGGER trg_merchant_payment_configs_updated_at
  BEFORE UPDATE ON public.merchant_payment_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Payment Intents (1-to-Many per Order; tracks eSewa transaction_uuid, Khalti pidx, Fonepay PRN)
CREATE TABLE public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  gateway TEXT NOT NULL CHECK (
    gateway IN ('esewa', 'khalti', 'fonepay', 'connectips', 'bank_transfer', 'cod', 'cash')
  ),
  external_reference TEXT NOT NULL, -- eSewa transaction_uuid, Khalti pidx, or internal ref
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (
    status IN ('initiated', 'pending_verification', 'verified', 'failed', 'expired', 'refunded')
  ),
  proof_reference TEXT, -- Customer-submitted voucher/txn ID for Fonepay/Bank QR
  gateway_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payment_intents_gateway_ref UNIQUE (gateway, external_reference)
);

CREATE INDEX idx_payment_intents_biz_order ON public.payment_intents (business_id, order_id, created_at DESC);
CREATE INDEX idx_payment_intents_biz_status ON public.payment_intents (business_id, status, created_at DESC);

CREATE TRIGGER trg_payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Deduplicated Payment Webhook Events (Prevents Replay Double-Credits)
CREATE TABLE public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payment_webhook_gateway_event UNIQUE (gateway, event_id)
);

CREATE INDEX idx_payment_webhooks_processed ON public.payment_webhook_events (processed_at DESC);

-- 4. Immutable Append-Only Merchant Finance Ledger
CREATE TABLE public.merchant_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'sale_captured',
      'cod_settled',
      'gateway_fee',
      'refund_issued',
      'manual_adjustment'
    )
  ),
  gateway TEXT NOT NULL,
  gross_amount_minor BIGINT NOT NULL, -- Signed: + for inflows, - for refunds/fees
  fee_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_amount_minor >= 0),
  net_amount_minor BIGINT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  description TEXT NOT NULL,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ledger_payment_intent_capture UNIQUE (payment_intent_id, entry_type)
);

CREATE INDEX idx_merchant_ledger_biz_created ON public.merchant_ledger_entries (business_id, created_at DESC);
CREATE INDEX idx_merchant_ledger_biz_order ON public.merchant_ledger_entries (business_id, order_id);

CREATE OR REPLACE FUNCTION public.prevent_merchant_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'merchant_ledger_entries is an immutable financial ledger and cannot be updated or deleted';
END;
$$;

CREATE TRIGGER trg_merchant_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.merchant_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_merchant_ledger_mutation();

-- ============================================================================
-- Enable & Force Row Level Security on All Payment & Ledger Tables
-- ============================================================================
ALTER TABLE public.merchant_payment_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payment_configs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.merchant_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_ledger_entries FORCE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY payment_configs_select_tenant
  ON public.merchant_payment_configs FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY payment_configs_write_owner_admin
  ON public.merchant_payment_configs FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin']));

CREATE POLICY payment_intents_select_tenant
  ON public.payment_intents FOR SELECT
  USING (business_id = public.current_business_id() AND public.has_active_membership(business_id));

CREATE POLICY payment_intents_write_ops
  ON public.payment_intents FOR ALL
  USING (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'accountant']))
  WITH CHECK (business_id = public.current_business_id() AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'staff', 'accountant']));

CREATE POLICY merchant_ledger_select_finance
  ON public.merchant_ledger_entries FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant'])
  );

CREATE POLICY merchant_ledger_insert_finance
  ON public.merchant_ledger_entries FOR INSERT
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager', 'accountant'])
  );
