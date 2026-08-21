-- Reconcile existing active native Jobs through the authoritative synchronization trigger.
BEGIN;

UPDATE public.dg_native_jobs
SET shop_date=shop_date,
    fulfillment_plan=fulfillment_plan
WHERE archived_at IS NULL
  AND ((shop_date IS NOT NULL AND COALESCE(shop_hours,0)>0)
    OR fulfillment_plan IN ('Delivery','Customer Pickup'));

COMMIT;
