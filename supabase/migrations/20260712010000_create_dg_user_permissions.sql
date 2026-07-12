CREATE TABLE IF NOT EXISTS public.dg_user_permissions (
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  access_level text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dg_user_permissions_pkey
    PRIMARY KEY (user_id, permission_key),
  CONSTRAINT dg_user_permissions_user_fk
    FOREIGN KEY (user_id)
    REFERENCES public.dg_user_profiles(user_id)
    ON DELETE CASCADE,
  CONSTRAINT dg_user_permissions_key_not_empty
    CHECK (length(btrim(permission_key)) > 0),
  CONSTRAINT dg_user_permissions_access_level_allowed
    CHECK (access_level IN ('none', 'view', 'use'))
);

ALTER TABLE public.dg_user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY dg_user_permissions_read_own
  ON public.dg_user_permissions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.dg_user_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_user_permissions
  FROM authenticated;
GRANT SELECT ON public.dg_user_permissions TO authenticated;
