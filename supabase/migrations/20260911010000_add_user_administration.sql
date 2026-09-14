-- User administration. No direct table grants or Auth mutation privileges added.
BEGIN;

CREATE FUNCTION public.dg_users_require_access(p_write boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles p WHERE p.user_id=actor AND p.active AND NOT p.must_change_password
  ) OR NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=actor AND p.permission_key='users'
      AND (p.access_level='use' OR (p_write IS FALSE AND p.access_level='view'))
  ) THEN RAISE EXCEPTION 'users.permission_required'; END IF;
  RETURN actor;
END $$;

CREATE FUNCTION public.dg_users_validate_permissions(p_permissions jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_permissions IS NULL OR pg_catalog.jsonb_typeof(p_permissions)<>'object' THEN
    RAISE EXCEPTION 'users.invalid_permissions';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_permissions))<>9 OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each_text(p_permissions) e
    WHERE e.key NOT IN ('production','production_checkpoints','calendar','jobs','documents','tools','reports','settings','users')
      OR e.value IS NULL OR e.value NOT IN ('none','view','use')
  ) THEN RAISE EXCEPTION 'users.invalid_permissions'; END IF;
END $$;

-- Internal projection only. No Auth internals or email lookup in SQL.
CREATE FUNCTION public.dg_users_record(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'userId',p.user_id,'displayName',p.display_name,'active',p.active,
    'companyLocation',p.company_location,'mustChangePassword',p.must_change_password,
    'passwordChangedAt',p.password_changed_at,
    'permissions',COALESCE((SELECT pg_catalog.jsonb_object_agg(a.permission_key,a.access_level)
      FROM public.dg_user_permissions a WHERE a.user_id=p.user_id),'{}'::jsonb))
  FROM public.dg_user_profiles p WHERE p.user_id=p_user_id;
$$;

CREATE FUNCTION public.dg_admin_list_users()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(false);
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(public.dg_users_record(p.user_id) ORDER BY p.display_name,p.user_id)
    FROM public.dg_user_profiles p),'[]'::jsonb);
END $$;

CREATE FUNCTION public.dg_admin_update_permissions(p_user_id uuid,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(true);
  PERFORM public.dg_users_validate_permissions(p_permissions);
  PERFORM 1 FROM public.dg_user_profiles p WHERE p.user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'users.not_found'; END IF;
  INSERT INTO public.dg_user_permissions(user_id,permission_key,access_level)
    SELECT p_user_id,e.key,e.value FROM pg_catalog.jsonb_each_text(p_permissions) e
    ON CONFLICT(user_id,permission_key) DO UPDATE SET access_level=EXCLUDED.access_level,updated_at=pg_catalog.now();
  RETURN public.dg_users_record(p_user_id);
END $$;

CREATE FUNCTION public.dg_admin_set_user_active(p_user_id uuid,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := public.dg_users_require_access(true);
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'users.invalid_active'; END IF;
  IF actor=p_user_id AND NOT p_active THEN RAISE EXCEPTION 'users.self_deactivation'; END IF;
  UPDATE public.dg_user_profiles SET active=p_active,updated_at=pg_catalog.now() WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'users.not_found'; END IF;
  RETURN public.dg_users_record(p_user_id);
END $$;

CREATE FUNCTION public.dg_admin_require_password_change(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(true);
  UPDATE public.dg_user_profiles SET must_change_password=true,updated_at=pg_catalog.now() WHERE user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'users.not_found'; END IF;
  RETURN public.dg_users_record(p_user_id);
END $$;

CREATE FUNCTION public.dg_admin_provision_user(p_user_id uuid,p_display_name text,p_company_location text,p_active boolean,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(true);
  PERFORM public.dg_users_validate_permissions(p_permissions);
  IF p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 200
    OR length(p_company_location)>200 OR p_active IS NULL THEN RAISE EXCEPTION 'users.invalid_profile'; END IF;
  -- FK requires an existing Auth identity; plain INSERT never overwrites a profile.
  INSERT INTO public.dg_user_profiles(user_id,display_name,company_location,active,is_manager,must_change_password)
    VALUES(p_user_id,btrim(p_display_name),NULLIF(btrim(p_company_location),''),p_active,false,true);
  INSERT INTO public.dg_user_permissions(user_id,permission_key,access_level)
    SELECT p_user_id,e.key,e.value FROM pg_catalog.jsonb_each_text(p_permissions) e;
  RETURN public.dg_users_record(p_user_id);
END $$;

-- Explicit owner and grants avoid inherited Supabase default privileges.
DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.dg_users_require_access(boolean)','public.dg_users_validate_permissions(jsonb)',
    'public.dg_users_record(uuid)','public.dg_admin_list_users()',
    'public.dg_admin_update_permissions(uuid,jsonb)','public.dg_admin_set_user_active(uuid,boolean)',
    'public.dg_admin_require_password_change(uuid)','public.dg_admin_provision_user(uuid,text,text,boolean,jsonb)'
  ] LOOP
    EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,anon,authenticated,service_role';
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.dg_admin_list_users(),public.dg_admin_update_permissions(uuid,jsonb),
  public.dg_admin_set_user_active(uuid,boolean),public.dg_admin_require_password_change(uuid),
  public.dg_admin_provision_user(uuid,text,text,boolean,jsonb) TO authenticated;
COMMIT;
