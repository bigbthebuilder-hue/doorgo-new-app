import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { handleLocalLogoutRequest } from '@/lib/auth/logout';

export async function POST(request: NextRequest) {
  return handleLocalLogoutRequest(request, {
    async signOut(options) {
      const supabase = await createAuthenticatedSupabaseServerClient();
      const { error } = await supabase.auth.signOut(options);
      return { error };
    },
  });
}
