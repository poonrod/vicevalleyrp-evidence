"use client";

import { BrandLogo } from "@/components/BrandLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { portalHref, preferFullPagePortalNav } from "@/lib/portalHref";

const ROLE_ORDER = ["viewer", "officer", "evidence_tech", "command_staff", "super_admin"] as const;

function canSeeAdminNav(role: string | null): boolean {
  if (!role) return false;
  const idx = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  const min = ROLE_ORDER.indexOf("command_staff");
  return idx >= min;
}

type NavLink = { href: string; label: string; adminOnly: boolean; developerOnly?: boolean };

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", adminOnly: false },
  { href: "/evidence", label: "Evidence", adminOnly: false },
  { href: "/incidents", label: "Incidents", adminOnly: false },
  { href: "/admin", label: "Admin", adminOnly: true },
  { href: "/admin/retention", label: "Retention", adminOnly: true },
  { href: "/admin/deletion-queue", label: "Deletion queue", adminOnly: true },
  { href: "/admin/video-policy", label: "Video policy", adminOnly: true },
  { href: "/developer", label: "Developer", adminOnly: false, developerOnly: true },
];

export function Sidebar() {
  const path = usePathname();
  const [role, setRole] = useState<string | null>(null);

  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    api<{ user: { globalRole: string }; isDeveloper?: boolean }>("/auth/me")
      .then((r) => {
        setRole(r.user.globalRole);
        setIsDeveloper(!!r.isDeveloper);
      })
      .catch(() => {
        setRole(null);
        setIsDeveloper(false);
      });
  }, []);

  const showAdmin = canSeeAdminNav(role);
  const visible = links.filter((l) => {
    if (l.developerOnly) return isDeveloper;
    if (l.adminOnly && !showAdmin) return false;
    return true;
  });

  const pathNorm = path.replace(/\/$/, "") || "/";
  const activeHref = visible
    .filter((l) => {
      const h = l.href.replace(/\/$/, "") || "/";
      return pathNorm === h || pathNorm.startsWith(h + "/");
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const useAnchor = preferFullPagePortalNav();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 min-h-screen p-4 flex flex-col gap-1 bg-zinc-950">
      <div className="mb-4 px-1">
        <BrandLogo href="/dashboard" className="h-11 w-auto max-w-[200px]" />
      </div>
      <div className="text-sm font-semibold text-zinc-400 mb-2 px-2">Navigation</div>
      {visible.map((l) => {
        const href = useAnchor ? portalHref(l.href) : l.href;
        const active = l.href === activeHref;
        const cls = `px-3 py-2 rounded-lg text-sm ${
          active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
        }`;
        return useAnchor ? (
          <a key={l.href} href={href} className={cls}>
            {l.label}
          </a>
        ) : (
          <Link key={l.href} href={href} className={cls}>
            {l.label}
          </Link>
        );
      })}
    </aside>
  );
}
