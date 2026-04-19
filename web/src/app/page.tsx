import { BrandLogo } from "@/components/BrandLogo";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <BrandLogo className="h-28 w-auto max-w-[min(90vw,320px)]" />
      <h1 className="text-3xl font-semibold tracking-tight">Vice Valley Evidence</h1>
      <p className="text-zinc-400 max-w-md text-center">
        Secure bodycam evidence management. Sign in with Discord to continue.
      </p>
      <Link
        href="/login"
        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
      >
        Continue
      </Link>
    </main>
  );
}
