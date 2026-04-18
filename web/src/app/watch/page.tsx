"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

type SharePayload = {
  fileName: string;
  mimeType: string;
  streamUrl: string;
  expiresInSeconds: number;
  linkExpiresAt: string | null;
};

function WatchInner() {
  const sp = useSearchParams();
  const token = (sp.get("token") || "").trim();
  const [data, setData] = useState<SharePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErr("Missing token. Open a valid share link from the evidence portal.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/share/${encodeURIComponent(token)}`, {
          method: "GET",
          credentials: "omit",
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = text.slice(0, 200);
          try {
            const j = JSON.parse(text) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        const j = JSON.parse(text) as SharePayload;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load video");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-300 p-8 text-center">
        <p className="text-sm max-w-md">{err}</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-300 p-8 text-center">
        <p className="text-sm max-w-md">{err}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-500">
        Loading…
      </div>
    );
  }

  const isVideo = data.mimeType.startsWith("video/");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-3 flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-sm font-medium truncate">Shared evidence — {data.fileName}</h1>
        {data.linkExpiresAt ? (
          <span className="text-xs text-zinc-500">Link expires {new Date(data.linkExpiresAt).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-zinc-500">Link does not expire</span>
        )}
      </header>
      <main className="flex-1 p-4 flex items-center justify-center">
        {isVideo ? (
          <video src={data.streamUrl} controls className="max-w-full max-h-[85vh] rounded-lg border border-zinc-800 bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.streamUrl} alt="" className="max-w-full max-h-[85vh] rounded-lg border border-zinc-800" />
        )}
      </main>
    </div>
  );
}

export default function PublicWatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div>
      }
    >
      <WatchInner />
    </Suspense>
  );
}
