export type PublicSupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export function normalizePublicSupabaseEnvironment(values: {
  url: string | undefined;
  publishableKey: string | undefined;
}): PublicSupabaseEnvironment {
  const url = values.url?.trim();
  const publishableKey = values.publishableKey?.trim();

  if (!url || !publishableKey) {
    throw new Error('Public Supabase authentication configuration is missing.');
  }

  return { url, publishableKey };
}

export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment {
  return normalizePublicSupabaseEnvironment({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
