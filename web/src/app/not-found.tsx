import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">404</h1>
      <Link href="/dashboard" className="text-blue-400 hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}
