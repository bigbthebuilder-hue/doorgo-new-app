CREATE TABLE IF NOT EXISTS public.dg_daily_capacity (
  production_date date PRIMARY KEY,
  available_hours numeric(8,2) NULL,
  staff_capacity_hours numeric(8,2) NULL,
  deduction_hours numeric(8,2) NULL,
  capacity_source text NOT NULL CHECK (capacity_source IN ('override', 'calculated', 'closure', 'unknown')),
  is_closed boolean NOT NULL DEFAULT false,
  notes text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_system text NOT NULL DEFAULT 'apps-script-bridge',
  calculated_at timestamptz NULL,
  mirrored_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_hours IS NULL OR available_hours >= 0),
  CHECK (staff_capacity_hours IS NULL OR staff_capacity_hours >= 0),
  CHECK (deduction_hours IS NULL OR deduction_hours >= 0),
  CHECK (
    (capacity_source = 'unknown' AND available_hours IS NULL)
    OR (capacity_source <> 'unknown' AND available_hours IS NOT NULL)
  )
);

ALTER TABLE public.dg_daily_capacity ENABLE ROW LEVEL SECURITY;
