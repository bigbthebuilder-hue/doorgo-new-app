BEGIN;

ALTER TABLE public.dg_user_profiles
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT true,
  ADD COLUMN password_changed_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.complete_dg_initial_password_setup()
RETURNS TABLE (
  must_change_password boolean,
  password_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  completed_at timestamptz := pg_catalog.now();
  existing_active boolean;
  existing_must_change boolean;
  existing_password_changed_at timestamptz;
BEGIN
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.dg_user_profiles AS profile
SET
  must_change_password = false,
  password_changed_at = completed_at,
  updated_at = completed_at
WHERE profile.user_id = caller_user_id
  AND profile.active = true
  AND profile.must_change_password = true;

  IF NOT FOUND THEN
    SELECT
      profile.active,
      profile.must_change_password,
      profile.password_changed_at
    INTO
      existing_active,
      existing_must_change,
      existing_password_changed_at
    FROM public.dg_user_profiles AS profile
    WHERE profile.user_id = caller_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A DoorGo profile is required';
    END IF;

    IF existing_active IS NOT TRUE THEN
      RAISE EXCEPTION 'An active DoorGo profile is required';
    END IF;

    IF existing_must_change IS FALSE THEN
      RETURN QUERY
      SELECT false, existing_password_changed_at;
      RETURN;
    END IF;

    RAISE EXCEPTION 'Password setup state could not be completed';
  END IF;

  RETURN QUERY
  SELECT false, completed_at;
END;
$$;

REVOKE ALL
  ON FUNCTION public.complete_dg_initial_password_setup()
  FROM PUBLIC;
REVOKE ALL
  ON FUNCTION public.complete_dg_initial_password_setup()
  FROM anon;
GRANT EXECUTE
  ON FUNCTION public.complete_dg_initial_password_setup()
  TO authenticated;

COMMIT;
