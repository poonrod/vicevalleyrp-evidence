"use client";

import { useEffect, useState } from "react";
import { api, ApiHttpError, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canDeleteEvidence, type GlobalRole } from "@vicevalley/shared";

type Row = {
  id: string;
  fileName: string;
  captureType: string;
  caseNumber: string | null;
  officerDiscordId: string;
  createdAt: string;
  retentionClass: string;
  scheduledDeletionAt: string | null;
};

export default function EvidenceListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<GlobalRole | null>(null);

  useEffect(() => {
    api<{ user: { globalRole: string } }>("/auth/me")
      .then((r) => setRole(r.user.globalRole as GlobalRole))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "50" });
    if (q) params.set("q", q);
    setLoadError(null);
    api<{ items: Row[] }>(`/evidence?${params}`)
      .then((r) => setRows(r.items))
      .catch((e) => {
        if (handleApiAuthNavigation(router, e)) return;
        const msg =
          e instanceof ApiHttpError ? e.message || `Request failed (${e.status})` : "Could not load evidence.";
        setLoadError(msg);
      });
  }, [router, q]);

  const showDelete = role != null && canDeleteEvidence(role);

  async function deleteRow(id: string, label: string) {
    if (!confirm(`Delete evidence “${label}”? This cannot be undone.`)) return;
    try {
      await api(`/evidence/${encodeURIComponent(id)}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      if (handleApiAuthNavigation(router, e)) return;
      const msg = e instanceof ApiHttpError ? e.message : "Delete failed";
      alert(msg);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Evidence" />
        <div className="p-4">
          {loadError ? (
            <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {loadError}
            </div>
          ) : null}
          <input
            className="w-full max-w-md mb-4 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
            placeholder="Search filename, incident, officer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="overflow-x-auto glass">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="p-3">File</th>
                  <th className="p-3">Capture</th>
                  <th className="p-3">Case</th>
                  <th className="p-3">Discord</th>
                  <th className="p-3">Retention</th>
                  <th className="p-3">Delete after</th>
                  {showDelete ? <th className="p-3 w-28">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/50">
                    <td className="p-3">
                      <Link href={`/evidence/view?id=${encodeURIComponent(r.id)}`} className="text-blue-400 hover:underline">
                        {r.fileName}
                      </Link>
                    </td>
                    <td className="p-3 text-zinc-400">{r.captureType}</td>
                    <td className="p-3">{r.caseNumber ?? "—"}</td>
                    <td className="p-3 font-mono text-xs">{r.officerDiscordId}</td>
                    <td className="p-3 text-zinc-400">{r.retentionClass}</td>
                    <td className="p-3 text-zinc-500 text-xs">
                      {r.scheduledDeletionAt ? new Date(r.scheduledDeletionAt).toLocaleString() : "—"}
                    </td>
                    {showDelete ? (
                      <td className="p-3">
                        <button
                          type="button"
                          className="text-sm text-red-400 hover:underline"
                          onClick={() => void deleteRow(r.id, r.fileName)}
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
