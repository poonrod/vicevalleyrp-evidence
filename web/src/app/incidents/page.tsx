"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiHttpError, handleApiAuthNavigation } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useRouter } from "next/navigation";
import { portalHref, preferFullPagePortalNav } from "@/lib/portalHref";

type Incident = {
  incidentId: string;
  title: string | null;
  caseNumber: string | null;
  createdAt: string;
  evidenceCount: number;
};

function suggestIncidentId(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const n = Math.floor(1000 + Math.random() * 9000);
  return `BCAM-${y}${m}${day}-${n}`;
}

export default function IncidentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Incident[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [incidentId, setIncidentId] = useState("");
  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [description, setDescription] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    incidentId: string;
    title: string | null;
    description: string | null;
    caseNumber: string | null;
    evidence: { id: string; fileName: string; captureType: string }[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const fullNav = preferFullPagePortalNav();

  const load = useCallback(() => {
    setLoadErr(null);
    api<{ items: Incident[] }>("/incidents")
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (handleApiAuthNavigation(router, e)) return;
        setLoadErr(e instanceof ApiHttpError ? e.message : "Could not load incidents.");
      });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api<{
      incident: {
        incidentId: string;
        title: string | null;
        description: string | null;
        caseNumber: string | null;
        evidence: { id: string; fileName: string; captureType: string }[];
      };
    }>(`/incidents/${encodeURIComponent(detailId)}`)
      .then((r) => setDetail(r.incident))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const id = incidentId.trim();
    if (!id) {
      setFormErr("Incident id is required.");
      return;
    }
    setSaving(true);
    try {
      await api("/incidents", {
        method: "POST",
        body: JSON.stringify({
          incidentId: id,
          title: title.trim() || undefined,
          caseNumber: caseNumber.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      setIncidentId("");
      setTitle("");
      setCaseNumber("");
      setDescription("");
      load();
    } catch (err) {
      if (handleApiAuthNavigation(router, err)) return;
      if (err instanceof ApiHttpError && err.status === 409) {
        setFormErr("That incident id already exists. Refresh the list or pick another id.");
        load();
        return;
      }
      setFormErr(err instanceof ApiHttpError ? err.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  const evidenceQueryHref = (inc: string) =>
    fullNav ? portalHref(`/evidence/?q=${encodeURIComponent(inc)}`) : `/evidence/?q=${encodeURIComponent(inc)}`;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Incidents" />
        <div className="p-6 space-y-6 max-w-4xl">
          <section className="glass p-4 space-y-3 text-sm">
            <h2 className="font-medium text-zinc-200">Create incident</h2>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Bodycam automatically registers a session when an officer turns the camera on (same id as the in-game
              HUD). Use this form to pre-create an id for desk work, or to add a title and case number. Evidence links
              when the upload includes this exact incident id.
            </p>
            <form className="space-y-3" onSubmit={(e) => void submitCreate(e)}>
              {formErr ? <p className="text-red-300 text-xs">{formErr}</p> : null}
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[12rem] space-y-1">
                  <span className="text-zinc-500 text-xs">Incident id</span>
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    placeholder="e.g. BCAM-20260418-4521"
                  />
                </label>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-xs shrink-0"
                  onClick={() => setIncidentId(suggestIncidentId())}
                >
                  Suggest id
                </button>
              </div>
              <label className="block space-y-1">
                <span className="text-zinc-500 text-xs">Title (optional)</span>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Traffic stop — Alta St"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-zinc-500 text-xs">Case number (optional)</span>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-zinc-500 text-xs">Description (optional)</span>
                <textarea
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 min-h-[72px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </form>
          </section>

          {loadErr ? <p className="text-red-300 text-sm">{loadErr}</p> : null}

          <section className="space-y-2">
            <h2 className="font-medium text-zinc-300 text-sm">Recent incidents</h2>
            {items.length === 0 && !loadErr ? <p className="text-zinc-500 text-sm">No incidents yet.</p> : null}
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.incidentId}>
                  <div className="glass p-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <button
                      type="button"
                      className="text-left space-y-1 min-w-0"
                      onClick={() => setDetailId((cur) => (cur === i.incidentId ? null : i.incidentId))}
                    >
                      <div className="font-medium font-mono text-sm break-all">{i.incidentId}</div>
                      <div className="text-sm text-zinc-500">{i.title ?? "—"}</div>
                      <div className="text-xs text-zinc-600">
                        {new Date(i.createdAt).toLocaleString()} · {i.evidenceCount} evidence file
                        {i.evidenceCount === 1 ? "" : "s"}
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 items-center shrink-0 text-sm">
                      <span className="text-zinc-500">Case: {i.caseNumber ?? "—"}</span>
                      {fullNav ? (
                        <a href={evidenceQueryHref(i.incidentId)} className="text-blue-400 hover:underline">
                          Search evidence
                        </a>
                      ) : (
                        <Link href={`/evidence/?q=${encodeURIComponent(i.incidentId)}`} className="text-blue-400 hover:underline">
                          Search evidence
                        </Link>
                      )}
                    </div>
                  </div>
                  {detailId === i.incidentId ? (
                    <div className="mt-2 ml-1 border-l border-zinc-700 pl-4 py-2 text-sm text-zinc-400">
                      {detailLoading ? (
                        <p>Loading…</p>
                      ) : detail ? (
                        <div className="space-y-2">
                          {detail.description ? <p className="text-zinc-300 whitespace-pre-wrap">{detail.description}</p> : null}
                          {detail.evidence.length === 0 ? (
                            <p className="text-zinc-600">No evidence linked to this incident id yet.</p>
                          ) : (
                            <ul className="list-disc list-inside space-y-1">
                              {detail.evidence.slice(0, 25).map((ev) => (
                                <li key={ev.id}>
                                  {fullNav ? (
                                    <a
                                      href={portalHref(`/evidence/view?id=${encodeURIComponent(ev.id)}`)}
                                      className="text-blue-400 hover:underline"
                                    >
                                      {ev.fileName}
                                    </a>
                                  ) : (
                                    <Link
                                      href={`/evidence/view?id=${encodeURIComponent(ev.id)}`}
                                      className="text-blue-400 hover:underline"
                                    >
                                      {ev.fileName}
                                    </Link>
                                  )}
                                  <span className="text-zinc-600"> · {ev.captureType}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {detail.evidence.length > 25 ? (
                            <p className="text-xs text-zinc-600">Showing 25 of {detail.evidence.length}.</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-zinc-600">Could not load details.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
