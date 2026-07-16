import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>DoorGo New App</h1>
      <p>Read-only Supabase foundation for the future DoorGo app.</p>

      <Link href="/production-board">
        Open read-only Production Board
      </Link>
      <p><Link href="/login">Sign in</Link> · <Link href="/account">View account</Link></p>
    </main>
  );
}
