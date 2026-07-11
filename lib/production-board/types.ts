import type { DailyCapacitySource } from './capacity-types';

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
  shopHours: number | null;
  shopHoursKnown: boolean;
  salesperson: string | null;
  source: string | null;
  sourceSystem: string | null;
};

export type ProductionBoardDay = {
  date: string;
  totalKnownShopHours: number;
  bookingCount: number;
  missingShopHoursCount: number;
  availableHours: number | null;
  staffCapacityHours: number | null;
  deductionHours: number | null;
  capacitySource: DailyCapacitySource;
  capacityKnown: boolean;
  isClosed: boolean;
  capacityNotes: string | null;
  remainingHours: number | null;
  overloadHours: number | null;
  plannedStarts: number | null;
  plannedStartsKnown: boolean;
  openingCarryIn: number | null;
  openingCarryKnown: boolean;
  flowLoad: number | null;
  endingCarryOut: number | null;
  openFlowCapacity: number | null;
  flowStatus: 'resolved' | 'unresolved';
  flowUnresolvedReason: ProductionFlowUnresolvedReason | null;
  weekendBookingException: boolean;
  cards: ProductionBoardCard[];
};

export type ProductionFlowUnresolvedReason =
  | 'before_baseline'
  | 'missing_shop_hours'
  | 'unknown_capacity'
  | 'upstream_unresolved';

export type ProductionBoardWeekendException = {
  date: string;
  cards: ProductionBoardCard[];
  plannedStarts: number | null;
  plannedStartsKnown: boolean;
};

export type ProductionBoardSummary = {
  totalBookings: number;
  totalKnownShopHours: number;
  scheduledDays: number;
  doorGoLinkedCount: number;
  bizTrackOnlyCount: number;
  missingShopHoursCount: number;
};

export type ProductionBoardWeek = {
  weekIndex: number;
  startDate: string;
  endDateExclusive: string;
  days: ProductionBoardDay[];
  bookingCount: number;
  totalKnownShopHours: number;
  missingShopHoursCount: number;
  totalAvailableHours: number;
  unknownCapacityDayCount: number;
  closureCount: number;
  dailyOverloadCount: number;
  capacityComplete: boolean;
  comparisonComplete: boolean;
  remainingHours: number | null;
  overloadHours: number | null;
  openingCarryIn: number | null;
  openingCarryKnown: boolean;
  plannedStarts: number | null;
  plannedStartsKnown: boolean;
  flowCapacity: number | null;
  endingCarryOut: number | null;
  unresolvedFlow: boolean;
  flowUnresolvedReason: ProductionFlowUnresolvedReason | null;
  carriesIntoNextShopDay: boolean | null;
  weekendBookingExceptionCount: number;
  weekendExceptions: ProductionBoardWeekendException[];
};

export type ProductionBoardViewModel = {
  startDate: string;
  endDateExclusive: string;
  weeks: number;
  days: ProductionBoardDay[];
  weekGroups: ProductionBoardWeek[];
  summary: ProductionBoardSummary;
  calculationStartDate: string;
};
