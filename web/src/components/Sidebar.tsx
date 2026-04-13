"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/evidence", label: "Evidence" },
  { href: "/incidents", label: "Incidents" },
  { href: "/admin", label: "Admin" },
  { href: "/admin/retention", label: "Retention" },
  { href: "/admin/deletion-queue", label: "Deletion queue" },
  { href: "/admin/video-policy", label: "Video policy" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 min-h-screen p-4 flex flex-col gap-1 bg-zinc-950">
      <div className="text-sm font-semibold text-zinc-400 mb-4 px-2">Navigation</div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-2 rounded-lg text-sm ${
            path === l.href ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </aside>
  );
}
