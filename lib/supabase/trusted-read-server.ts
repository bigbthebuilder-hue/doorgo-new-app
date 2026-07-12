import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Trusted legacy/read client. Never use this service-role client for user authorization. */
export function createTrustedReadOnlySupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Trusted Supabase read configuration is missing.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
