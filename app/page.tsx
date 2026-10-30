import { redirect } from 'next/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { protectedLandingDestination } from '@/lib/app-shell/navigation';

export default async function HomePage() {
  const access = await requireDoorGoProtectedAccess();
  redirect(protectedLandingDestination(access));
}
