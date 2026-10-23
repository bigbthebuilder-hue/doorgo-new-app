-- Inactive Stage 2 adapter prerequisite. No existing flow, flag or grant is changed.
BEGIN;
CREATE FUNCTION public.dg_password_employee_snapshot(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'user_id', p.user_id, 'active', p.active, 'must_change_password', p.must_change_password,
    'generation', COALESCE(s.generation,1)::text,
    'setup_required', COALESCE(s.setup_required,p.must_change_password),
    'reset_pending', COALESCE(s.reset_pending,false),
    'unresolved', (SELECT pg_catalog.to_jsonb(o) FROM public.dg_password_operations o
      WHERE o.user_id=p.user_id AND o.state IN ('reserved','unknown')),
    'completion', (SELECT pg_catalog.to_jsonb(o) FROM public.dg_password_operations o
      WHERE o.user_id=p.user_id AND o.generation=s.generation AND o.kind='employee_setup'
        AND o.state='succeeded' AND o.outcome='succeeded'
      ORDER BY o.created_at DESC,o.operation_id LIMIT 1)
  ) FROM public.dg_user_profiles p
  LEFT JOIN public.dg_password_setup_state s ON s.user_id=p.user_id
  WHERE p.user_id=p_user_id;
$$;
ALTER FUNCTION public.dg_password_employee_snapshot(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_password_employee_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dg_password_employee_snapshot(uuid) TO service_role;
COMMIT;
