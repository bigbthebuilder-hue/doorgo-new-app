import Link from 'next/link';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Sign in to DoorGo</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use the email address and password assigned to your DoorGo account.
        </p>
        <LoginForm />
        <Link className="mt-6 inline-block text-sm text-sky-700" href="/production-board">
          Open the public Production Board
        </Link>
      </div>
    </main>
  );
}
