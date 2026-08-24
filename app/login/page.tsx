import Link from 'next/link';
import Image from 'next/image';
import { LoginForm } from './login-form';
import { redirect } from 'next/navigation';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { protectedLandingDestination } from '@/lib/app-shell/navigation';

export default async function LoginPage() {
  const access=await getCurrentDoorGoAccess();if(access.state==='active')redirect(access.profile.mustChangePassword?'/account/change-password':protectedLandingDestination(access));
  return (
    <main className="doorgo-entry px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4"><Image src="/brand/doorgo-mark.svg" alt="DoorGo" width={64} height={64} priority/><div><p className="text-xs font-bold uppercase tracking-[.15em] text-slate-500">Door Shop Operations</p><h1 className="text-2xl font-semibold">Sign in to DoorGo</h1></div></div>
        <p className="mt-2 text-sm text-slate-600">
          Use the email address and password assigned to your DoorGo account.
        </p>
        <LoginForm />
        <div className="mt-6 flex justify-between text-sm"><Link className="text-sky-700" href="/">DoorGo home</Link><Link className="text-sky-700" href="/production-board">Public Production Board</Link></div>
      </div>
    </main>
  );
}
