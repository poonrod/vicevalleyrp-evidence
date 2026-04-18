import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { HostGuard } from "@/components/HostGuard";

export const metadata: Metadata = {
  title: "Vice Valley Evidence",
  description: "Law enforcement evidence portal",
};

/**
 * `<base href>` makes root-relative URLs (including Next static export segment fetches like
 * `/evidence/index.txt`) resolve against the portal. If NEXT_PUBLIC_WEB_APP_URL is mistakenly
 * set to the API origin (same as NEXT_PUBLIC_API_URL), those requests hit Express `/evidence`
 * and 404 — and the client router can end up with bogus query params such as `?id=index.txt`.
 */
function shouldEmitPortalBaseHref(portalUrl: string, apiUrl: string): boolean {
  const p = portalUrl.trim();
  if (!p) return false;
  const a = apiUrl.trim();
  if (!a) return true;
  try {
    const po = new URL(p.startsWith("http") ? p : `https://${p}`).origin;
    const ao = new URL(a.startsWith("http") ? a : `https://${a}`).origin;
    return po !== ao;
  } catch {
    return false;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  const portalUrl = process.env.NEXT_PUBLIC_WEB_APP_URL?.trim() ?? "";
  const portalBase = portalUrl.replace(/\/+$/, "");
  const portalBaseHref =
    portalBase && shouldEmitPortalBaseHref(portalUrl, apiUrl) ? `${portalBase}/` : "";
  const hostGuardEarly =
    apiUrl && portalUrl
      ? `void function(){try{var p=${JSON.stringify(portalUrl)};var a=${JSON.stringify(apiUrl)};var ao=new URL(/^https?:\\/\\//.test(a)?a:"https://"+a).origin;var po=new URL(/^https?:\\/\\//.test(p)?p:"https://"+p).origin;if(ao===po)return;if(location.origin===ao){location.replace(p.replace(/\\/+$/, "")+location.pathname+location.search+location.hash);}}catch(e){}}();`
      : "";

  return (
    <html lang="en">
      <head>
        {portalBaseHref ? <base href={portalBaseHref} /> : null}
      </head>
      <body>
        {hostGuardEarly ? (
          <Script
            id="host-guard-early"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: hostGuardEarly }}
          />
        ) : null}
        <HostGuard>{children}</HostGuard>
      </body>
    </html>
  );
}
