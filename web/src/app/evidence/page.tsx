"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "50" });
    if (q) params.set("q", q);
    api<{ items: Row[] }>(`/evidence?${params}`)
      .then((r) => setRows(r.items))
      .catch(() => router.push("/login"));
  }, [router, q]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Evidence" />
        <div className="p-4">
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
