-- Fulfillment order-family tables are read through RLS and mutated only by authoritative RPCs.
BEGIN;
REVOKE ALL ON TABLE public.dg_fulfillment_order_portions,public.dg_calendar_item_orders FROM anon,authenticated;
GRANT SELECT ON TABLE public.dg_fulfillment_order_portions,public.dg_calendar_item_orders TO authenticated;
COMMIT;
