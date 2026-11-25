-- Migration 003: Row Level Security (RLS) & Transaction-Scoped Tenant Context
-- Product: Sajilo Commerce

-- Helper: checks whether the current authenticated user has an active membership in p_business_id
CREATE OR REPLACE FUNCTION public.has_active_membership(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.business_id = p_business_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

-- Helper: checks whether the current user holds one of the allowed roles in p_business_id
CREATE OR REPLACE FUNCTION public.has_business_role(p_business_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.business_id = p_business_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY(p_roles)
  );
$$;

-- Helper: sets transaction-local tenant context after confirming active membership
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_business_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_business_id IS NULL THEN
    PERFORM set_config('app.current_business_id', '', true);
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR NOT public.has_active_membership(p_business_id) THEN
    RAISE EXCEPTION 'Forbidden: active membership required for business %', p_business_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.current_business_id', p_business_id::TEXT, true);
END;
$$;

-- ============================================================================
-- Enable & Force Row Level Security on All Phase 1 Tables
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans FORCE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. profiles policies
-- ============================================================================
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2. businesses policies
-- ============================================================================
CREATE POLICY businesses_select_member_or_active_tenant
  ON public.businesses FOR SELECT
  USING (
    public.has_active_membership(id)
    OR (public.current_business_id() = id AND public.has_active_membership(id))
  );

CREATE POLICY businesses_insert_authenticated
  ON public.businesses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY businesses_update_admin_owner
  ON public.businesses FOR UPDATE
  USING (
    id = public.current_business_id()
    AND public.has_business_role(id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    id = public.current_business_id()
    AND public.has_business_role(id, ARRAY['owner', 'admin'])
  );

-- ============================================================================
-- 3. memberships policies
-- ============================================================================
CREATE POLICY memberships_select_tenant_members
  ON public.memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      business_id = public.current_business_id()
      AND public.has_active_membership(business_id)
    )
  );

CREATE POLICY memberships_insert_admin_owner
  ON public.memberships FOR INSERT
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY memberships_update_admin_owner
  ON public.memberships FOR UPDATE
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY memberships_delete_admin_owner
  ON public.memberships FOR DELETE
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

-- ============================================================================
-- 4. invitations policies
-- ============================================================================
CREATE POLICY invitations_select_admin_owner
  ON public.invitations FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY invitations_insert_admin_owner
  ON public.invitations FOR INSERT
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY invitations_update_admin_owner
  ON public.invitations FOR UPDATE
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin'])
  );

-- ============================================================================
-- 5. locations policies
-- ============================================================================
CREATE POLICY locations_select_tenant_members
  ON public.locations FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY locations_insert_managers
  ON public.locations FOR INSERT
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

CREATE POLICY locations_update_managers
  ON public.locations FOR UPDATE
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'manager'])
  );

-- ============================================================================
-- 6. plans & subscriptions & usage_records policies
-- ============================================================================
CREATE POLICY plans_select_public_or_authenticated
  ON public.plans FOR SELECT
  USING (is_public = TRUE OR auth.uid() IS NOT NULL);

CREATE POLICY subscriptions_select_tenant_members
  ON public.subscriptions FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

CREATE POLICY subscriptions_update_owner
  ON public.subscriptions FOR UPDATE
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner'])
  )
  WITH CHECK (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner'])
  );

CREATE POLICY usage_records_select_tenant_members
  ON public.usage_records FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_active_membership(business_id)
  );

-- ============================================================================
-- 7. audit_logs policies (append-only insert for scoped tenant; read for owner/admin/accountant)
-- ============================================================================
CREATE POLICY audit_logs_select_authorized_roles
  ON public.audit_logs FOR SELECT
  USING (
    business_id = public.current_business_id()
    AND public.has_business_role(business_id, ARRAY['owner', 'admin', 'accountant'])
  );

CREATE POLICY audit_logs_insert_scoped
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    (
      business_id = public.current_business_id()
      AND public.has_active_membership(business_id)
    )
    OR (business_id IS NULL AND auth.uid() IS NOT NULL)
  );

-- ============================================================================
-- 8. platform_admins policies (self-check only; privileged admin routines use service role)
-- ============================================================================
CREATE POLICY platform_admins_select_self
  ON public.platform_admins FOR SELECT
  USING (user_id = auth.uid() AND is_active = TRUE);