"use client";

import { useEffect, useState } from "react";
import { api, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";

export default function RetentionAdminPage() {
  const router = useRouter();
  const [s, setS] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Record<string, unknown>>("/admin/settings/retention")
      .then(setS)
      .catch((e) => handleApiAuthNavigation(router, e));
  }, [router]);

  const num = (k: string) => (
    <label className="block text-sm mb-3">
      <span className="text-zinc-500">{k}</span>
      <input
        type="number"
        className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
        value={Number(s[k] ?? 0)}
        onChange={(e) => setS((p) => ({ ...p, [k]: Number(e.target.value) }))}
      />
    </label>
  );

  const bool = (k: string) => (
    <label className="flex items-center gap-2 text-sm mb-2">
      <input
        type="checkbox"
        checked={Boolean(s[k])}
        onChange={(e) => setS((p) => ({ ...p, [k]: e.target.checked }))}
      />
      {k}
    </label>
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar title="Retention settings" />
        <div className="p-6 max-w-xl space-y-4">
          {num("defaultDeleteAfterDays")}
          {num("caseEvidenceDeleteAfterDays")}
          {num("taggedEvidenceDeleteAfterDays")}
          {num("tempDeleteAfterDays")}
          {num("archivedDeleteAfterDays")}
          {num("longVideoDeleteAfterDays")}
          {bool("notesCountAsModified")}
          {bool("tagsCountAsModified")}
          {bool("caseNumberCountsAsProtected")}
          {bool("autoDeleteEnabled")}
          {bool("deleteWorkerEnabled")}
          {bool("useSoftDeleteBeforeHardDelete")}
          {num("softDeleteGraceDays")}
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-blue-600"
            onClick={async () => {
              await api("/admin/settings/retention", { method: "PATCH", body: JSON.stringify(s) });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            Save
          </button>
          {saved && <span className="text-green-400 text-sm">Saved</span>}
        </div>
      </div>
    </div>
  );
}
