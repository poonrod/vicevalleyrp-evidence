"use client";

import { useEffect, useState } from "react";
import { api, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";

type Incident = { incidentId: string; title: string | null; caseNumber: string | null };

export default function IncidentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Incident[]>([]);

  useEffect(() => {
    api<{ items: Incident[] }>("/incidents")
      .then((r) => setItems(r.items))
      .catch((e) => handleApiAuthNavigation(router, e));
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar title="Incidents" />
        <div className="p-6 space-y-3">
          {items.map((i) => (
            <div key={i.incidentId} className="glass p-4 flex justify-between items-center">
              <div>
                <div className="font-medium">{i.incidentId}</div>
                <div className="text-sm text-zinc-500">{i.title}</div>
              </div>
              <div className="text-sm text-zinc-400">Case: {i.caseNumber ?? "—"}</div>
            </div>
          ))}
          {items.length === 0 && <p className="text-zinc-500">No incidents yet.</p>}
        </div>
      </div>
    </div>
  );
}
