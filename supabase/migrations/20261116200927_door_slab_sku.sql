-- Add one optional label-metadata key; no tables, rows, dimensions or scheduling change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $patch$
DECLARE
  definition text;
  old_text text;
  new_text text;
BEGIN
  definition := pg_catalog.pg_get_functiondef('public.dg_update_native_job(uuid,bigint,jsonb,jsonb)'::regprocedure);
  IF strpos(definition,'FOR UPDATE')=0 OR strpos(definition,'native_job.stale_revision')=0
    OR strpos(definition,'labelSlabSku')>0 THEN RAISE EXCEPTION 'door_labels.unexpected_update_definition'; END IF;
  old_text := $$- 'labelDoorId' - 'labelProductCode' - 'labelIndividualDoorIds'$$;
  new_text := old_text || $$ - 'labelSlabSku'$$;
  IF (length(definition)-length(replace(definition,old_text,'')))<>length(old_text)
  THEN RAISE EXCEPTION 'door_labels.unexpected_update_definition'; END IF;
  definition := replace(definition,old_text,new_text);
  old_text := $$IN ('labelDoorId','labelProductCode','labelIndividualDoorIds')$$;
  new_text := $$IN ('labelDoorId','labelProductCode','labelIndividualDoorIds','labelSlabSku')$$;
  IF (length(definition)-length(replace(definition,old_text,'')))<>length(old_text)
  THEN RAISE EXCEPTION 'door_labels.unexpected_update_definition'; END IF;
  EXECUTE replace(definition,old_text,new_text);

  definition := pg_catalog.pg_get_functiondef('public.dg_update_native_door_labels(uuid,uuid,jsonb)'::regprocedure);
  old_text := $$NOT IN ('doorId','productCode','individualDoorIds')$$;
  new_text := $$NOT IN ('doorId','productCode','doorSlabSku','individualDoorIds')$$;
  IF (length(definition)-length(replace(definition,old_text,'')))<>length(old_text)
    OR strpos(definition,'native_job.stale_labels')=0 OR strpos(definition,'dg_require_business_access')=0
  THEN RAISE EXCEPTION 'door_labels.unexpected_label_definition'; END IF;
  definition := replace(definition,old_text,new_text);
  old_text := $$CASE entry.key WHEN 'doorId' THEN 'labelDoorId' ELSE 'labelProductCode' END$$;
  new_text := $$CASE entry.key WHEN 'doorId' THEN 'labelDoorId' WHEN 'doorSlabSku' THEN 'labelSlabSku' ELSE 'labelProductCode' END$$;
  IF (length(definition)-length(replace(definition,old_text,'')))<>length(old_text)
  THEN RAISE EXCEPTION 'door_labels.unexpected_label_definition'; END IF;
  EXECUTE replace(definition,old_text,new_text);
END;
$patch$;
-- CREATE OR REPLACE retains the existing owner, grants, business/Jobs Use guards,
-- parent/line lock ordering, field-level conflict checks and retry behaviour.
COMMIT;
