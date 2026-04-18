"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiHttpError, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter, useSearchParams } from "next/navigation";

export default function EvidenceDetailClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const router = useRouter();
  const [ev, setEv] = useState<Record<string, unknown> | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [caseNum, setCaseNum] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoadError(null);
    api<{ evidence: Record<string, unknown> }>(`/evidence/${id}`)
      .then((r) => {
        setEv(r.evidence);
        setCaseNum((r.evidence.caseNumber as string) ?? "");
      })
      .catch((e) => {
        if (handleApiAuthNavigation(router, e)) return;
        const msg =
          e instanceof ApiHttpError ? e.message || `Request failed (${e.status})` : "Could not load this record.";
        setLoadError(msg);
      });
  }, [id, router]);

  useEffect(() => {
    if (!id) {
      router.replace("/evidence");
      return;
    }
    setEv(null);
    setLoadError(null);
    load();
  }, [id, router, load]);

  if (!id) {
    return null;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-red-200 text-sm max-w-md">{loadError}</p>
        <button type="button" className="text-blue-400 hover:underline text-sm" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  if (!ev) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }

  const isImage = String(ev.mimeType).startsWith("image/");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Evidence detail" />
        <div className="p-6 grid gap-6 lg:grid-cols-2">
          <div className="glass p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm"
                onClick={async () => {
                  const r = await api<{ url: string }>(`/evidence/${id}/download-url`);
                  setUrl(r.url);
                }}
              >
                Get secure view URL
              </button>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 underline">
                  Open media
                </a>
              )}
            </div>
            {isImage && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="max-w-full rounded-lg border border-zinc-800" />
            ) : (
              <p className="text-zinc-500 text-sm">Request a short-lived URL to preview or download.</p>
            )}
          </div>
          <div className="space-y-4">
            <div className="glass p-4 text-sm space-y-1">
              <div className="text-zinc-500">Storage key</div>
              <div className="font-mono text-xs break-all">{String(ev.storageKey)}</div>
              <div className="text-zinc-500 mt-3">MIME</div>
              <div>{String(ev.mimeType)}</div>
              <div className="text-zinc-500 mt-3">Capture</div>
              <div>{String(ev.captureType)}</div>
              <div className="text-zinc-500 mt-3">Retention</div>
              <div>{String(ev.retentionClass)}</div>
            </div>
            <div className="glass p-4 space-y-2">
              <div className="font-medium">Case number</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  value={caseNum}
                  onChange={(e) => setCaseNum(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-sm"
                  onClick={async () => {
                    await api(`/evidence/${id}/case-number`, {
                      method: "PATCH",
                      body: JSON.stringify({ caseNumber: caseNum || null }),
                    });
                    load();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="glass p-4 space-y-2">
              <div className="font-medium">Add tag</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-sm"
                  onClick={async () => {
                    await api(`/evidence/${id}/tags`, {
                      method: "POST",
                      body: JSON.stringify({ tag }),
                    });
                    setTag("");
                    load();
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="glass p-4 space-y-2">
              <div className="font-medium">Note</div>
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm min-h-[80px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-zinc-800 text-sm"
                onClick={async () => {
                  await api(`/evidence/${id}/notes`, {
                    method: "POST",
                    body: JSON.stringify({ note }),
                  });
                  setNote("");
                  load();
                }}
              >
                Post note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
