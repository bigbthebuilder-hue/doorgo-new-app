import type { JobIntakeRepository } from './job-intake-types';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';

export function createJobIntakeRepository(testRepository?: JobIntakeRepository): JobIntakeRepository {
  if (testRepository) return testRepository;
  return createHostedJobIntakeRepository({ client: async () => {
    const { createAuthenticatedSupabaseServerClient } = await import('../supabase/server');
    return createAuthenticatedSupabaseServerClient();
  } });
}
