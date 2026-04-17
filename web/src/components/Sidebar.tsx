"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const ROLE_ORDER = ["viewer", "officer", "evidence_tech", "command_staff", "super_admin"] as const;

function canSeeAdminNav(role: string | null): boolean {
  if (!role) return false;
  const idx = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  const min = ROLE_ORDER.indexOf("command_staff");
  return idx >= min;
}

const links = [
  { href: "/dashboard", label: "Dashboard", adminOnly: false },
  { href: "/evidence", label: "Evidence", adminOnly: false },
  { href: "/incidents", label: "Incidents", adminOnly: false },
  { href: "/admin", label: "Admin", adminOnly: true },
  { href: "/admin/retention", label: "Retention", adminOnly: true },
  { href: "/admin/deletion-queue", label: "Deletion queue", adminOnly: true },
  { href: "/admin/video-policy", label: "Video policy", adminOnly: true },
];

export function Sidebar() {
  const path = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: { globalRole: string } }>("/auth/me")
      .then((r) => setRole(r.user.globalRole))
      .catch(() => setRole(null));
  }, []);

  const showAdmin = canSeeAdminNav(role);
  const visible = links.filter((l) => !l.adminOnly || showAdmin);

  const activeHref = visible
    .filter((l) => path === l.href || path.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 min-h-screen p-4 flex flex-col gap-1 bg-zinc-950">
      <div className="text-sm font-semibold text-zinc-400 mb-4 px-2">Navigation</div>
      {visible.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-2 rounded-lg text-sm ${
            l.href === activeHref ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </aside>
  );
}
