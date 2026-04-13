"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";

export default function VideoPolicyPage() {
  const router = useRouter();
  const [s, setS] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api<Record<string, unknown>>("/admin/settings/video-policy")
      .then(setS)
      .catch(() => router.push("/login"));
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar title="Video policy" />
        <div className="p-6 max-w-xl space-y-3 text-sm">
          {Object.keys(s).map((k) => (
            <label key={k} className="block">
              <span className="text-zinc-500">{k}</span>
              <input
                className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                value={String(s[k] ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setS((p) => ({
                    ...p,
                    [k]:
                      typeof (s as Record<string, unknown>)[k] === "number"
                        ? Number(v)
                        : v === "true" || v === "false"
                          ? v === "true"
                          : v,
                  }));
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-blue-600"
            onClick={async () => {
              await api("/admin/settings/video-policy", {
                method: "PATCH",
                body: JSON.stringify(s),
              });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
