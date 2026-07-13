import 'server-only';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { createCheckpointService } from './checkpoint-action-contract';

const execute = createCheckpointService(async () => {
  const supabase = await createAuthenticatedSupabaseServerClient();
  return {
      async getUser() { const { data, error } = await supabase.auth.getUser(); return { user: data.user, error }; },
      async rpc(name, parameters) { const { data, error } = await supabase.rpc(name, parameters); return { data, error }; },
  };
});
export const confirmCheckpoint = (request: unknown) => execute('confirm', request);
export const reviseCheckpoint = (request: unknown) => execute('revise', request);
export const removeCheckpoint = (request: unknown) => execute('remove', request);
