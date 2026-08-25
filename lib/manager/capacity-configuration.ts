export const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] as const;
export type CapacityRole='direct_production'|'support';
export type WeekdayCapacity={weekday:number;scheduledHours:number;capacityHours:number};
export type StaffCapacityVersion={effectiveFrom:string;capacityRole:CapacityRole;weekdays:WeekdayCapacity[]};
export type CapacityStaff={staffId:string;displayName:string;active:boolean;revision:number;versions:StaffCapacityVersion[]};
export type ManagerCapacityConfiguration={companyLocation:string;staff:CapacityStaff[];workweeks:Array<{effectiveFrom:string;weekdays:number[]}>};
export function validateWeekdays(role:CapacityRole,days:WeekdayCapacity[]):string|null{if(days.length!==7||new Set(days.map(d=>d.weekday)).size!==7||days.some(d=>d.weekday<0||d.weekday>6))return 'Configure all seven weekdays.';for(const day of days){if(!Number.isFinite(day.scheduledHours)||!Number.isFinite(day.capacityHours)||day.scheduledHours<0||day.scheduledHours>24||day.capacityHours<0||day.capacityHours>24)return 'Hours must be between 0 and 24.';if(role==='direct_production'&&day.capacityHours>day.scheduledHours)return 'Productive hours cannot exceed scheduled hours.';}return null;}
export function capacitySummary(staff:CapacityStaff):string{const latest=staff.versions[0];if(!latest)return 'Not configured';const values=latest.weekdays.filter(d=>d.capacityHours>0).map(d=>d.capacityHours);return values.length&&values.every(v=>v===values[0])?`${values[0]}h ${latest.capacityRole==='support'?'away impact':'productive'}`:'Varies by day';}
