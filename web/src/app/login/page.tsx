import { loginUrl } from "@/lib/api";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="glass max-w-md w-full p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-zinc-400 text-sm">
          Use your Discord account. Your server administrator must grant appropriate roles after first login.
        </p>
        <a
          href={loginUrl()}
          className="block text-center w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium"
        >
          Continue with Discord
        </a>
        <Link href="/" className="block text-center text-sm text-zinc-500 hover:text-zinc-300">
          Back
        </Link>
      </div>
    </main>
  );
}
