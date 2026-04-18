"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiHttpError, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter, useSearchParams } from "next/navigation";
import { canDeleteEvidence, type GlobalRole } from "@vicevalley/shared";
import { portalHref } from "@/lib/portalHref";
import { playBodycamActivationPreview, primeBodycamPreviewAudio } from "@/lib/bodycamPreviewSound";

/** Evidence row ids are UUIDs; reject junk like `index.txt` from bad static-export / base-tag resolution. */
const EVIDENCE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatEvidenceWatermarkTime(iso: unknown): string {
  if (iso == null) return "";
  const s = typeof iso === "string" ? iso : String(iso);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " T").replace(/\.\d{3}Z$/, "Z");
}

function watermarkSerialFromEvidenceId(evidenceId: string): string {
  const hex = evidenceId.replace(/-/g, "");
  const head = hex.slice(0, 8);
  const n = Number.parseInt(head, 16);
  const m = Number.isFinite(n) ? n % 10_000_000 : 0;
  return `x${String(m).padStart(7, "0")}`;
}

export default function EvidenceDetailClient() {
  const searchParams = useSearchParams();
  const rawId = searchParams.get("id");
  const id = rawId && EVIDENCE_ID_RE.test(rawId) ? rawId : null;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [ev, setEv] = useState<Record<string, unknown> | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [caseNum, setCaseNum] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<GlobalRole | null>(null);
  const axonActivationPlayedRef = useRef(false);
  const [logoBroken, setLogoBroken] = useState(false);
  type ShareRow = { id: string; token: string; expiresAt: string | null; createdAt: string };
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [shareNeverExpires, setShareNeverExpires] = useState(true);
  const [shareExpiresLocal, setShareExpiresLocal] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    axonActivationPlayedRef.current = false;
    setLogoBroken(false);
  }, [id]);

  const onEvidenceVideoPlay = useCallback(() => {
    if (axonActivationPlayedRef.current) return;
    axonActivationPlayedRef.current = true;
    playBodycamActivationPreview(0.35);
  }, []);

  useEffect(() => {
    api<{ user: { globalRole: string } }>("/auth/me")
      .then((r) => setRole(r.user.globalRole as GlobalRole))
      .catch(() => setRole(null));
  }, []);

  const load = useCallback(() => {
    if (!id) return;
    setLoadError(null);
    api<{ evidence: Record<string, unknown> }>(`/evidence/${id}`)
      .then((r) => {
        setEv(r.evidence);
        setCaseNum((r.evidence.caseNumber as string) ?? "");
      })
      .catch((e) => {
        if (handleApiAuthNavigation(routerRef.current, e)) return;
        const msg =
          e instanceof ApiHttpError ? e.message || `Request failed (${e.status})` : "Could not load this record.";
        setLoadError(msg);
      });
  }, [id]);

  useEffect(() => {
    if (!rawId || !EVIDENCE_ID_RE.test(rawId)) {
      routerRef.current.replace("/evidence");
    }
  }, [rawId]);

  useEffect(() => {
    if (!id) return;
    setEv(null);
    setLoadError(null);
    load();
  }, [id, load]);

  useEffect(() => {
    if (!id || !ev) return;
    const v = String(ev.mimeType || "");
    if (!v.startsWith("video/")) {
      setShares(null);
      return;
    }
    api<{ shares: ShareRow[] }>(`/evidence/${id}/shares`)
      .then((r) => setShares(r.shares))
      .catch(() => setShares(null));
  }, [id, ev]);

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

  const mime = String(ev.mimeType);
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const showDelete = role != null && canDeleteEvidence(role);
  const durationSec =
    typeof ev.durationSeconds === "number" && !Number.isNaN(ev.durationSeconds) ? ev.durationSeconds : null;

  async function deleteEvidence(row: Record<string, unknown>) {
    const name = String(row.fileName ?? "item");
    if (!confirm(`Delete “${name}”? This cannot be undone.`)) return;
    try {
      await api(`/evidence/${encodeURIComponent(id!)}`, { method: "DELETE" });
      router.replace("/evidence");
    } catch (e) {
      if (handleApiAuthNavigation(router, e)) return;
      alert(e instanceof ApiHttpError ? e.message : "Delete failed");
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Evidence detail" />
        <div className="p-6 grid gap-6 lg:grid-cols-2">
          <div
            className="glass p-4 space-y-3"
            onPointerDownCapture={() => {
              void primeBodycamPreviewAudio();
            }}
          >
            <div className="flex gap-2 flex-wrap items-center">
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
              {showDelete ? (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-red-950 border border-red-900 text-red-200 text-sm ml-auto"
                  onClick={() => void deleteEvidence(ev)}
                >
                  Delete evidence
                </button>
              ) : null}
            </div>
            {isImage && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="max-w-full rounded-lg border border-zinc-800" />
            ) : isVideo && url ? (
              <div className="relative w-full max-w-full rounded-lg border border-zinc-800 bg-black overflow-hidden">
                <video
                  src={url}
                  controls
                  className="max-w-full w-full block"
                  onPlay={onEvidenceVideoPlay}
                />
                <div className="pointer-events-none absolute inset-0 flex justify-end items-start p-2 sm:p-3">
                  <div className="flex flex-row items-start gap-2 sm:gap-3 max-w-[min(100%,22rem)]">
                    <div className="flex flex-col gap-0.5 font-mono text-[10px] sm:text-[13px] leading-tight text-right">
                      <span
                        className="text-transparent"
                        style={{
                          WebkitTextStroke: "1px rgba(255,255,255,0.95)",
                          textShadow: "0 0 6px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.9)",
                        }}
                      >
                        {formatEvidenceWatermarkTime(ev.timestampUtc)}
                      </span>
                      <span
                        className="text-transparent"
                        style={{
                          WebkitTextStroke: "1px rgba(255,255,255,0.95)",
                          textShadow: "0 0 6px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.9)",
                        }}
                      >
                        {`AXON BODY WF ${watermarkSerialFromEvidenceId(id!)}`}
                      </span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoBroken ? "/overlay/axon-delta-gold.svg" : "/overlay/axon-delta-gold.png"}
                      alt=""
                      onError={() => setLogoBroken(true)}
                      className="h-10 w-auto sm:h-[3.25rem] shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(0,0,0,0.95)]"
                    />
                  </div>
                </div>
              </div>
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
              {durationSec != null ? (
                <>
                  <div className="text-zinc-500 mt-3">Duration</div>
                  <div>{durationSec}s</div>
                </>
              ) : null}
            </div>
            {isVideo && shares != null ? (
              <div className="glass p-4 space-y-3 text-sm">
                <div className="font-medium">Public watch link</div>
                <p className="text-zinc-500 text-xs">
                  Anyone with the link can view this video until it expires or you revoke it. Stream URLs are
                  short-lived; reopen the watch page for a fresh stream.
                </p>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input type="checkbox" checked={shareNeverExpires} onChange={(e) => setShareNeverExpires(e.target.checked)} />
                  Never expires
                </label>
                {!shareNeverExpires ? (
                  <label className="block space-y-1">
                    <span className="text-zinc-500 text-xs">Expires (local time)</span>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
                      value={shareExpiresLocal}
                      onChange={(e) => setShareExpiresLocal(e.target.value)}
                    />
                  </label>
                ) : null}
                {shareMsg ? <p className="text-xs text-amber-200/90">{shareMsg}</p> : null}
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-blue-600 text-sm"
                  onClick={async () => {
                    setShareMsg(null);
                    try {
                      const body = shareNeverExpires
                        ? { neverExpires: true as const }
                        : {
                            neverExpires: false as const,
                            expiresAt: shareExpiresLocal ? new Date(shareExpiresLocal).toISOString() : "",
                          };
                      if (!shareNeverExpires && !shareExpiresLocal) {
                        setShareMsg("Pick an expiry date or choose never expires.");
                        return;
                      }
                      const r = await api<{ share: ShareRow }>(`/evidence/${id}/share`, {
                        method: "POST",
                        body: JSON.stringify(body),
                      });
                      const row: ShareRow = {
                        id: r.share.id,
                        token: r.share.token,
                        expiresAt: r.share.expiresAt ? String(r.share.expiresAt) : null,
                        createdAt: String(r.share.createdAt),
                      };
                      setShares((s) => (s ? [row, ...s] : [row]));
                      const path = `/watch/?token=${encodeURIComponent(r.share.token)}`;
                      const full = portalHref(path);
                      await navigator.clipboard.writeText(full);
                      setShareMsg("Link created and copied to clipboard.");
                    } catch (e) {
                      if (handleApiAuthNavigation(router, e)) return;
                      setShareMsg(e instanceof ApiHttpError ? e.message : "Could not create link.");
                    }
                  }}
                >
                  Create link &amp; copy
                </button>
                {shares.length > 0 ? (
                  <ul className="space-y-2 text-xs border-t border-zinc-800 pt-3 mt-2">
                    {shares.map((s) => (
                      <li key={s.id} className="flex flex-col gap-1 border-b border-zinc-800/80 pb-2">
                        <span className="text-zinc-500">
                          {s.expiresAt ? `Until ${new Date(s.expiresAt).toLocaleString()}` : "No expiry"}
                        </span>
                        <div className="flex flex-wrap gap-2 items-center">
                          <code className="text-[10px] text-zinc-400 break-all flex-1 min-w-0">
                            {portalHref(`/watch/?token=${encodeURIComponent(s.token)}`)}
                          </code>
                          <button
                            type="button"
                            className="text-blue-400 hover:underline shrink-0"
                            onClick={() =>
                              void navigator.clipboard.writeText(
                                portalHref(`/watch/?token=${encodeURIComponent(s.token)}`)
                              )
                            }
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="text-red-400 hover:underline shrink-0"
                            onClick={async () => {
                              if (!confirm("Revoke this link?")) return;
                              await api(`/evidence/${id}/share/${encodeURIComponent(s.id)}`, { method: "DELETE" });
                              setShares((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
                            }}
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-zinc-600 text-xs">No active links yet.</p>
                )}
              </div>
            ) : null}
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
