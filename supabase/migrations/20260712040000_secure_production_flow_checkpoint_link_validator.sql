-- Phase 2F-C2: run deferred checkpoint-link validation in a trusted context.

BEGIN;

ALTER FUNCTION public.validate_production_flow_checkpoint_links()
  OWNER TO postgres;

ALTER FUNCTION public.validate_production_flow_checkpoint_links()
  SECURITY DEFINER;

ALTER FUNCTION public.validate_production_flow_checkpoint_links()
  SET search_path TO '';

REVOKE ALL
  ON FUNCTION public.validate_production_flow_checkpoint_links()
  FROM PUBLIC;
REVOKE ALL
  ON FUNCTION public.validate_production_flow_checkpoint_links()
  FROM anon;
REVOKE ALL
  ON FUNCTION public.validate_production_flow_checkpoint_links()
  FROM authenticated;

COMMIT;
