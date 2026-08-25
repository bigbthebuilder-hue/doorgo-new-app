-- Default table privileges are broader than this immutable audit relation requires.
BEGIN;
REVOKE ALL ON TABLE public.dg_production_booking_delete_events FROM anon,authenticated;
GRANT SELECT ON TABLE public.dg_production_booking_delete_events TO authenticated;
COMMIT;
