-- Migration 002: Subscription Plans, Tenant Subscriptions, Quota Usage, Audit Logs & Nepal Plan Seeds
-- Product: Sajilo Commerce

-- 1. Subscription Plans (Server-Enforced Quotas & Exact Paisa Pricing)
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('free', 'starter', 'growth', 'business', 'enterprise')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  monthly_price_minor BIGINT NOT NULL CHECK (monthly_price_minor >= 0),
  annual_price_minor BIGINT NOT NULL CHECK (annual_price_minor >= 0),
  limits JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tenant Subscriptions (1 Active/Current Subscription per Business)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  override_limits JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_plan_status ON public.subscriptions (plan_id, status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Quota & Usage Snapshots per Business
CREATE TABLE public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL CHECK (metric_key IN ('products_count', 'locations_count', 'staff_seats_count', 'custom_domains_count', 'monthly_orders_count')),
  current_value INTEGER NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  period_key TEXT NOT NULL DEFAULT 'lifetime',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_usage_business_metric_period UNIQUE (business_id, metric_key, period_key)
);

CREATE INDEX idx_usage_records_business ON public.usage_records (business_id);

-- 4. Append-Only Security & Operational Audit Logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('merchant_user', 'platform_admin', 'system', 'webhook')),
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_business_created ON public.audit_logs (business_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created ON public.audit_logs (actor_id, created_at DESC);

-- Prevent accidental UPDATE or DELETE on audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be updated or deleted';
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- 5. Seed Default Nepal Subscription Tiers (1 NPR = 100 paisa; -1 = unlimited)
INSERT INTO public.plans (code, name, description, currency_code, monthly_price_minor, annual_price_minor, limits, is_public, sort_order)
VALUES
  (
    'free',
    'Free',
    'For first-time sellers testing online and social order tracking.',
    'NPR',
    0,
    0,
    '{"max_products": 25, "max_locations": 1, "max_staff_seats": 1, "max_custom_domains": 0, "store_builder": true, "cod_reconciliation": false, "integrations": false, "social_inbox": false}'::jsonb,
    TRUE,
    1
  ),
  (
    'starter',
    'Starter',
    'For solo Instagram and Facebook sellers managing daily orders and stock.',
    'NPR',
    49900,
    499000,
    '{"max_products": 150, "max_locations": 1, "max_staff_seats": 2, "max_custom_domains": 0, "store_builder": true, "cod_reconciliation": true, "integrations": false, "social_inbox": false}'::jsonb,
    TRUE,
    2
  ),
  (
    'growth',
    'Growth',
    'For growing D2C brands and retail shops with custom domains and courier COD settlements.',
    'NPR',
    149900,
    1499000,
    '{"max_products": 1000, "max_locations": 2, "max_staff_seats": 5, "max_custom_domains": 1, "store_builder": true, "cod_reconciliation": true, "integrations": true, "social_inbox": false}'::jsonb,
    TRUE,
    3
  ),
  (
    'business',
    'Business',
    'For multi-branch retailers and high-volume stores across Nepal.',
    'NPR',
    299900,
    2999000,
    '{"max_products": -1, "max_locations": 5, "max_staff_seats": 15, "max_custom_domains": 3, "store_builder": true, "cod_reconciliation": true, "integrations": true, "social_inbox": true}'::jsonb,
    TRUE,
    4
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom multi-warehouse operations, dedicated onboarding, and custom integrations.',
    'NPR',
    0,
    0,
    '{"max_products": -1, "max_locations": -1, "max_staff_seats": -1, "max_custom_domains": -1, "store_builder": true, "cod_reconciliation": true, "integrations": true, "social_inbox": true}'::jsonb,
    FALSE,
    5
  )
ON CONFLICT (code) DO NOTHING;