"use client";

import { BrandLogo } from "@/components/BrandLogo";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur sticky top-0 z-10 gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <BrandLogo href="/dashboard" className="h-9 w-auto max-w-[160px]" />
        <h1 className="truncate text-lg font-medium">{title}</h1>
      </div>
      <button
        type="button"
        className="text-sm text-zinc-400 hover:text-white"
        onClick={async () => {
          await api("/auth/logout", { method: "POST" });
          router.push("/login");
        }}
      >
        Log out
      </button>
    </header>
  );
}
