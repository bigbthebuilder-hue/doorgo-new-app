import 'server-only';
import {createAuthenticatedSupabaseServerClient} from '@/lib/supabase/server';
import type{StaffAwayRangePayload}from'./staff-away';

export async function loadStaffAwayRange(start:string,endExclusive:string):Promise<StaffAwayRangePayload>{
  const {data,error}=await (await createAuthenticatedSupabaseServerClient()).rpc('load_staff_away_calendar_range',{p_start:start,p_end_exclusive:endExclusive});
  if(error)throw new Error(`Failed to load Staff Away: ${error.message}`);
  const payload=(data??{}) as Partial<StaffAwayRangePayload>;
  return {activeStaff:Array.isArray(payload.activeStaff)?payload.activeStaff:[],periods:Array.isArray(payload.periods)?payload.periods:[]};
}
