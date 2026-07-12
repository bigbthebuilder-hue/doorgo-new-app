export type ConfirmedFlowCheckpointRow = {
  checkpoint_id: string;
  checkpoint_series_id: string;
  production_date: string;
  opening_carry_hours: number | string;
  checkpoint_status: 'confirmed';
  revision_number: number;
  calculated_opening_carry_snapshot: number | string | null;
  adjustment_hours_snapshot: number | string | null;
  calculation_version: string | null;
  note: string | null;
  recorded_at: string;
  recorded_by_user_id: string | null;
  actor_type: 'office_user' | 'shop_tablet' | 'system_import';
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  source_system: string;
};

export type ConfirmedFlowCheckpoint = {
  checkpointId: string;
  checkpointSeriesId: string;
  productionDate: string;
  openingCarryHours: number;
  revisionNumber: number;
  calculatedOpeningCarrySnapshot: number | null;
  adjustmentHoursSnapshot: number | null;
  calculationVersion: string | null;
  note: string | null;
  recordedAt: string;
  recordedByUserId: string | null;
  actorType: 'office_user' | 'shop_tablet' | 'system_import';
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  sourceSystem: string;
};
