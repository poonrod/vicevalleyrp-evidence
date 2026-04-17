"use client";

import { useEffect } from "react";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
const PORTAL = (process.env.NEXT_PUBLIC_WEB_APP_URL ?? "").trim();

/**
 * If the static export is mistakenly opened on the API hostname (same bundle deployed to both
 * hosts, or a bad bookmark), Next will request `/evidence/index.txt` on the API origin → 404
 * because Express is not Next. Send the user to the real portal origin.
 */
export function HostGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!API || !PORTAL) return;
    try {
      const apiOrigin = new URL(API.startsWith("http") ? API : `https://${API}`).origin;
      const portalBase = PORTAL.replace(/\/+$/, "");
      if (window.location.origin === apiOrigin) {
        const rest = window.location.pathname + window.location.search + window.location.hash;
        window.location.replace(`${portalBase}${rest}`);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return <>{children}</>;
}
