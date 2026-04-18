"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiHttpError, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";

type Toast = { id: number; kind: "ok" | "err"; text: string };

function JsonBlock({ data }: { data: unknown }) {
  const [open, setOpen] = useState(true);
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900 flex justify-between gap-2"
        onClick={() => setOpen(!open)}
      >
        <span>JSON</span>
        <span>{open ? "▼" : "▶"}</span>
      </button>
      {open ? (
        <pre className="text-xs text-zinc-300 p-3 max-h-80 overflow-auto border-t border-zinc-800 whitespace-pre-wrap break-all">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

export default function DeveloperPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastJson, setLastJson] = useState<unknown>(null);
  const [flags, setFlags] = useState<Record<string, boolean> | null>(null);
  const [bulkFilters, setBulkFilters] = useState({
    dateFrom: "",
    dateTo: "",
    officerDiscordId: "",
    caseNumber: "",
    unassignedOnly: false,
    videoOnly: false,
  });
  const [bulkConfirm, setBulkConfirm] = useState("");

  const toast = useCallback((kind: "ok" | "err", text: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const runDev = useCallback(
    async (label: string, path: string, init?: RequestInit) => {
      setBusy(label);
      try {
        const r = await api<unknown>(path, init);
        setLastJson(r);
        toast("ok", `${label}: OK`);
        return r;
      } catch (e) {
        if (handleApiAuthNavigation(router, e)) return null;
        const msg = e instanceof ApiHttpError ? e.message : String(e);
        toast("err", `${label}: ${msg}`);
        setLastJson({ error: msg });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [router, toast]
  );

  useEffect(() => {
    api<{ isDeveloper?: boolean }>("/auth/me")
      .then((r) => setAllowed(!!r.isDeveloper))
      .catch((e) => {
        if (handleApiAuthNavigation(router, e)) return;
        setAllowed(false);
      });
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    void api<{ flags: Record<string, boolean> }>("/developer/flags").then((r) => setFlags(r.flags));
  }, [allowed]);

  if (allowed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Checking access…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-red-300 text-sm max-w-md">You do not have access to the Developer Panel.</p>
        <button type="button" className="text-blue-400 hover:underline text-sm" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Developer" />
        <div className="p-6 space-y-6 max-w-5xl">
          <div className="rounded-lg border border-red-900/80 bg-red-950/40 px-4 py-3 text-red-100 text-sm">
            <strong>Developer access</strong> — sensitive controls enabled. Every action is logged server-side with your
            Discord ID and IP.
          </div>

          {toasts.length ? (
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg px-3 py-2 text-sm shadow-lg border ${
                    t.kind === "ok" ? "bg-emerald-950 border-emerald-800 text-emerald-100" : "bg-red-950 border-red-800 text-red-100"
                  }`}
                >
                  {t.text}
                </div>
              ))}
            </div>
          ) : null}

          <section className="glass p-4 space-y-3">
            <h2 className="font-semibold text-zinc-200">System status</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
                onClick={() => void runDev("Status", "/developer/status")}
              >
                {busy === "Status" ? "…" : "Ping DB + storage"}
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
                onClick={() => void runDev("Retention status", "/developer/retention/status")}
              >
                Retention status
              </button>
            </div>
          </section>

          <section className="glass p-4 space-y-3">
            <h2 className="font-semibold text-zinc-200">Feature flags</h2>
            <p className="text-xs text-zinc-500">
              ENABLE_RETENTION gates the scheduled deletion worker. ENABLE_HASH_CHECK requires SHA-256 on portal video
              completes. ENABLE_STRICT_PERMISSIONS limits officers/viewers to their own evidence in list API.
            </p>
            {flags ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(flags) as (keyof typeof flags)[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={!!flags[k]}
                      onChange={async (e) => {
                        const next = { ...flags, [k]: e.target.checked };
                        setFlags(next);
                        try {
                          await api("/developer/flags", {
                            method: "PATCH",
                            body: JSON.stringify({ [k]: e.target.checked }),
                          });
                          toast("ok", `Updated ${String(k)}`);
                        } catch (err) {
                          if (handleApiAuthNavigation(router, err)) return;
                          toast("err", String(err));
                          void api<{ flags: Record<string, boolean> }>("/developer/flags").then((r) => setFlags(r.flags));
                        }
                      }}
                    />
                    <span className="font-mono text-xs">{String(k)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Loading flags…</p>
            )}
          </section>

          <section className="glass p-4 space-y-3">
            <h2 className="font-semibold text-zinc-200">Testing tools</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() => void runDev("Test DB", "/developer/tests/db", { method: "POST", body: "{}" })}
              >
                Test database
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() => void runDev("Test storage", "/developer/tests/storage", { method: "POST", body: "{}" })}
              >
                Test storage list
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev(
                    "Simulate upload-url",
                    "/developer/tests/upload-simulate",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        fileName: "dev-test.jpg",
                        mimeType: "image/jpeg",
                        fileSize: 1024,
                        captureType: "developer_simulate",
                      }),
                    }
                  )
                }
              >
                Simulate upload-url validation
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev(
                    "Simulate complete metadata",
                    "/developer/tests/metadata-save",
                    {
                      method: "POST",
                      body: JSON.stringify({
                        storageKey: "dev/never_written.bin",
                        evidenceId: "00000000-0000-4000-8000-000000000001",
                        fileName: "x.bin",
                        mimeType: "application/octet-stream",
                        fileSize: 1,
                        type: "other",
                        captureType: "developer_simulate",
                        timestampUtc: new Date().toISOString(),
                        activationSource: "manual_command",
                      }),
                    }
                  )
                }
              >
                Simulate complete-metadata parse
              </button>
            </div>
          </section>

          <section className="glass p-4 space-y-3">
            <h2 className="font-semibold text-zinc-200">Maintenance</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-amber-950 border border-amber-900 text-amber-100 text-sm"
                onClick={() => void runDev("Run retention batch", "/developer/retention/run-once", { method: "POST", body: "{}" })}
              >
                Run retention batch once
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev("Orphan storage scan", "/developer/maintenance/orphan-storage-scan", {
                    method: "POST",
                    body: JSON.stringify({ maxList: 400 }),
                  })
                }
              >
                Scan orphan storage keys
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev("Orphan DB scan", "/developer/maintenance/orphan-db-scan", {
                    method: "POST",
                    body: JSON.stringify({ sample: 100 }),
                  })
                }
              >
                Scan DB rows missing object
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev("Repair scheduling", "/developer/maintenance/repair-scheduling", {
                    method: "POST",
                    body: JSON.stringify({ limit: 30 }),
                  })
                }
              >
                Repair missing schedules
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev("Rehash sample", "/developer/maintenance/rehash", {
                    method: "POST",
                    body: JSON.stringify({ limit: 5 }),
                  })
                }
              >
                Recalculate SHA-256 (sample)
              </button>
            </div>
          </section>

          <section className="glass p-4 space-y-3 border border-red-950/50">
            <h2 className="font-semibold text-red-200">Safe mass delete</h2>
            <p className="text-xs text-zinc-500">
              Dry run returns counts only. Execute requires typing CONFIRM and deletes at most 500 matching rows (storage
              delete + DB tombstone).
            </p>
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Date from (ISO)</span>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                  value={bulkFilters.dateFrom}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Date to (ISO)</span>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                  value={bulkFilters.dateTo}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Officer Discord ID</span>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                  value={bulkFilters.officerDiscordId}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, officerDiscordId: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Case number</span>
                <input
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                  value={bulkFilters.caseNumber}
                  onChange={(e) => setBulkFilters((f) => ({ ...f, caseNumber: e.target.value }))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={bulkFilters.unassignedOnly}
                onChange={(e) => setBulkFilters((f) => ({ ...f, unassignedOnly: e.target.checked }))}
              />
              Unassigned only (no incident + no case)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={bulkFilters.videoOnly}
                onChange={(e) => setBulkFilters((f) => ({ ...f, videoOnly: e.target.checked }))}
              />
              Video MIME only
            </label>
            <div className="flex flex-wrap gap-2 items-end">
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() =>
                  void runDev("Bulk delete preview", "/developer/evidence/bulk-delete-preview", {
                    method: "POST",
                    body: JSON.stringify({
                      ...bulkFilters,
                      dateFrom: bulkFilters.dateFrom || undefined,
                      dateTo: bulkFilters.dateTo || undefined,
                      officerDiscordId: bulkFilters.officerDiscordId || undefined,
                      caseNumber: bulkFilters.caseNumber || undefined,
                    }),
                  })
                }
              >
                Dry run
              </button>
              <input
                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm flex-1 min-w-[8rem]"
                placeholder="Type CONFIRM to execute"
                value={bulkConfirm}
                onChange={(e) => setBulkConfirm(e.target.value)}
              />
              <button
                type="button"
                disabled={!!busy || bulkConfirm !== "CONFIRM"}
                className="px-3 py-1.5 rounded-lg bg-red-900 text-red-100 text-sm disabled:opacity-40"
                onClick={() =>
                  void runDev("Bulk delete execute", "/developer/evidence/bulk-delete-execute", {
                    method: "POST",
                    body: JSON.stringify({
                      confirm: "CONFIRM",
                      filters: {
                        ...bulkFilters,
                        dateFrom: bulkFilters.dateFrom || undefined,
                        dateTo: bulkFilters.dateTo || undefined,
                        officerDiscordId: bulkFilters.officerDiscordId || undefined,
                        caseNumber: bulkFilters.caseNumber || undefined,
                      },
                    }),
                  }).then(() => setBulkConfirm(""))
                }
              >
                Execute delete
              </button>
            </div>
          </section>

          <section className="glass p-4 space-y-3">
            <h2 className="font-semibold text-zinc-200">Debug logs</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() => void runDev("Audit logs", "/developer/audit-logs?limit=100")}
              >
                Last 100 developer audit logs
              </button>
              <button
                type="button"
                disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm"
                onClick={() => void runDev("Failed uploads", "/developer/failed-uploads?limit=50")}
              >
                Failed upload attempts
              </button>
            </div>
          </section>

          <section className="glass p-4 space-y-2">
            <h2 className="font-semibold text-zinc-200">Last response</h2>
            {lastJson != null ? <JsonBlock data={lastJson} /> : <p className="text-zinc-500 text-sm">Run a tool to see JSON.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
