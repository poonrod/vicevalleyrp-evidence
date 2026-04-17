"use client";

import { useEffect, useState } from "react";
import { api, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = { id: string; fileName: string; scheduledDeletionAt: string | null };

export default function DeletionQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);

  useEffect(() => {
    api<{ items: Row[] }>("/admin/deletion-queue")
      .then((r) => setItems(r.items))
      .catch((e) => handleApiAuthNavigation(router, e));
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar title="Deletion queue (upcoming)" />
        <div className="p-6 space-y-2">
          {items.map((i) => (
            <div key={i.id} className="glass p-3 flex justify-between text-sm">
              <Link href={`/evidence/view?id=${encodeURIComponent(i.id)}`} className="text-blue-400 hover:underline">
                {i.fileName}
              </Link>
              <span className="text-zinc-500">
                {i.scheduledDeletionAt ? new Date(i.scheduledDeletionAt).toLocaleString() : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
