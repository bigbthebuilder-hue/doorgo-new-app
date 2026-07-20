import type { JobIntakeRepository } from './job-intake-types';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';

export function createJobIntakeRepository(): JobIntakeRepository {
  return createLocalJobIntakeRepository();
}
