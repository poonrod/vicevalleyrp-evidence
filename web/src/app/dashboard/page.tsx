"use client";

import { useEffect, useState } from "react";
import { api, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; globalRole: string } | null>(null);
  const [evidence, setEvidence] = useState<{ total: number } | null>(null);

  useEffect(() => {
    api<{ user: { username: string; globalRole: string } }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch((e) => handleApiAuthNavigation(router, e));
    api<{ total: number }>("/evidence?pageSize=1")
      .then((r) => setEvidence({ total: r.total }))
      .catch(() => {});
  }, [router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar title="Dashboard" />
        <div className="p-6 grid gap-4 md:grid-cols-3">
          <div className="glass p-5">
            <div className="text-zinc-500 text-sm">Signed in as</div>
            <div className="text-xl font-medium mt-1">{user.username}</div>
            <div className="text-zinc-400 text-sm mt-2">Role: {user.globalRole}</div>
          </div>
          <div className="glass p-5">
            <div className="text-zinc-500 text-sm">Evidence records</div>
            <div className="text-3xl font-semibold mt-1">{evidence?.total ?? "—"}</div>
            <Link href="/evidence" className="text-blue-400 text-sm mt-3 inline-block hover:underline">
              View all
            </Link>
          </div>
          <div className="glass p-5">
            <div className="text-zinc-500 text-sm">Quick actions</div>
            <Link href="/incidents" className="block mt-3 text-blue-400 hover:underline">
              Incidents
            </Link>
            <Link href="/admin" className="block mt-2 text-blue-400 hover:underline">
              Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
