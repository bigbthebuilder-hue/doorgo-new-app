export type DailyCapacitySource = 'override' | 'calculated' | 'closure' | 'unknown';

export type DailyCapacityRow = {
  production_date: string;
  available_hours: number | string | null;
  staff_capacity_hours: number | string | null;
  deduction_hours: number | string | null;
  capacity_source: DailyCapacitySource;
  is_closed: boolean;
  notes: string | null;
  details: Record<string, unknown>;
  source_system: string;
  calculated_at: string | null;
  mirrored_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyCapacity = {
  productionDate: string;
  availableHours: number | null;
  staffCapacityHours: number | null;
  deductionHours: number | null;
  source: DailyCapacitySource;
  isClosed: boolean;
  notes: string | null;
  details: Record<string, unknown>;
  calculatedAt: string | null;
  mirroredAt: string | null;
};
