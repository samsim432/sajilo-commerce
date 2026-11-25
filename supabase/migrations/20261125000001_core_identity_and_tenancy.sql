-- Migration 001: Core Identity, Businesses, Memberships, Invitations, Locations & Platform Admins
-- Product: Sajilo Commerce

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reusable updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Helper function to safely read transaction-scoped tenant context
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw_val TEXT;
BEGIN
  raw_val := NULLIF(current_setting('app.current_business_id', true), '');
  IF raw_val IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_val::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- 1. User Profiles (1:1 with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 1),
  phone_e164 TEXT,
  avatar_url TEXT,
  preferred_locale TEXT NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'ne')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile when a new Supabase Auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, preferred_locale)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'preferred_locale', ''), 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 2. Businesses (Top-Level Multi-Tenant Boundary)
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'),
  category TEXT NOT NULL DEFAULT 'general',
  country_code CHAR(2) NOT NULL DEFAULT 'NP',
  default_currency CHAR(3) NOT NULL DEFAULT 'NPR',
  default_locale TEXT NOT NULL DEFAULT 'en' CHECK (default_locale IN ('en', 'ne')),
  support_phone_e164 TEXT,
  support_email TEXT,
  tax_registered BOOLEAN NOT NULL DEFAULT FALSE,
  pan_vat_number TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_deletion')),
  deletion_scheduled_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Memberships (6-Role RBAC per Business)
CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'accountant', 'warehouse')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_memberships_business_user UNIQUE (business_id, user_id)
);

CREATE INDEX idx_memberships_user_status ON public.memberships (user_id, status);
CREATE INDEX idx_memberships_business_role ON public.memberships (business_id, role);

CREATE TRIGGER trg_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Staff Invitations (72-Hour Cryptographic Token Hash)
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (position('@' IN email) > 1),
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'accountant', 'warehouse')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_business_status ON public.invitations (business_id, status);

-- 5. Business Locations (Shops & Warehouses)
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
  address_line1 TEXT,
  city TEXT,
  district TEXT,
  province TEXT,
  postal_code TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_locations_one_default_per_business
  ON public.locations (business_id)
  WHERE is_default = TRUE;

CREATE INDEX idx_locations_business_active ON public.locations (business_id, is_active);

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Platform Super-Admins (Isolated from Merchant Roles)
CREATE TABLE public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_role TEXT NOT NULL DEFAULT 'operator' CHECK (admin_role IN ('super_admin', 'operator', 'support')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_platform_admins_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();