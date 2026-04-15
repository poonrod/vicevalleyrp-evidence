import { Suspense } from "react";
import EvidenceDetailClient from "./EvidenceDetailClient";

export default function EvidenceViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>
      }
    >
      <EvidenceDetailClient />
    </Suspense>
  );
}
