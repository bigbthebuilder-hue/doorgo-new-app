import 'server-only';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export async function reorderNeedsAttentionWithAccess(request:{expectedBookingIds:string[];orderedBookingIds:string[]}):Promise<{ok:true}|{ok:false;message:string}>{
  try { const supabase=await createAuthenticatedSupabaseServerClient(); const {error}=await supabase.rpc('reorder_production_needs_attention',{p_expected_booking_ids:request.expectedBookingIds,p_ordered_booking_ids:request.orderedBookingIds}); return error?{ok:false,message:error.message}:{ok:true}; }
  catch { return {ok:false,message:'Needs Attention could not be reordered.'}; }
}
