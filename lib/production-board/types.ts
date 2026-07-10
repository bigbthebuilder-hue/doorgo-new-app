export type ProductionBookingRow = {
  booking_id: string;
  job_id: string | null;
  calendar_id: string | null;
  calendar_event_id: string | null;
  title: string | null;
  production_date: string;
  shop_hours: number | string | null;
  salesperson: string | null;
  status: string | null;
  schedule_status: string | null;
  booking_kind: string | null;
  board_visible: boolean | null;
  all_day: boolean | null;
  calendar_sync_state: string | null;
  source: string | null;
  source_system: string | null;
  locked: boolean | null;
};

export type DoorGoJobRow = {
  job_id: string;
  customer: string | null;
  site_address: string | null;
  salesperson: string | null;
  status: string | null;
  active: string | null;
  shop_hours: number | string | null;
  job_stage: string | null;
};

export type ProductionBoardCard = {
  bookingId: string;
  type: 'doorgo_linked' | 'biztrack_only';
  typeLabel: 'DoorGo-linked' | 'BizTrack-only';
  productionDate: string;
  title: string;
  customer: string | null;
  jobId: string | null;
  calendarId: string | null;
  calendarEventId: string | null;
  shopHours: number;
  salesperson: string | null;
  source: string | null;
  sourceSystem: string | null;
};

export type ProductionBoardDay = {
  date: string;
  totalShopHours: number;
  cards: ProductionBoardCard[];
};