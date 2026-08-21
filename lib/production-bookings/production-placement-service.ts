import 'server-only';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { executeProductionPlacement, type ProductionPlacementRequest, type ProductionPlacementResult } from './production-placement-contract';

export async function placeProductionBookingWithAccess(request:ProductionPlacementRequest):Promise<ProductionPlacementResult>{
  const access=await getCurrentDoorGoAccess();
  if(access.state!=='active'||getPermissionAccess(access,'production')!=='use'||getPermissionAccess(access,'calendar')!=='use')
    return {ok:false,code:'permission_required',message:'Calendar and Production use permission are required.'};
  try{const supabase=await createAuthenticatedSupabaseServerClient();return executeProductionPlacement(request,async(name,params)=>{const {data,error}=await supabase.rpc(name,params);return {data,error};});}
  catch{return {ok:false,code:'unavailable',message:'Production could not be moved. Please try again.'};}
}
