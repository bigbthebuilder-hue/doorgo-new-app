CREATE TABLE IF NOT EXISTS public.dg_user_profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_manager boolean NOT NULL DEFAULT false,
  company_location text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dg_user_profiles_user_fk
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,
  CONSTRAINT dg_user_profiles_display_name_not_empty
    CHECK (length(btrim(display_name)) > 0)
);

ALTER TABLE public.dg_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY dg_user_profiles_read_own
  ON public.dg_user_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.dg_user_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.dg_user_profiles
  FROM authenticated;
GRANT SELECT ON public.dg_user_profiles TO authenticated;
