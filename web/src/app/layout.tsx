import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { HostGuard } from "@/components/HostGuard";

export const metadata: Metadata = {
  title: "Vice Valley Evidence",
  description: "Law enforcement evidence portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  const portalUrl = process.env.NEXT_PUBLIC_WEB_APP_URL?.trim() ?? "";
  const portalBase = portalUrl.replace(/\/+$/, "");
  /** Resolve relative URLs (including Next RSC `…/index.txt`) against the portal, not the API host. */
  const portalBaseHref = portalBase ? `${portalBase}/` : "";
  const hostGuardEarly =
    apiUrl && portalUrl
      ? `void function(){try{var p=${JSON.stringify(portalUrl)};var a=${JSON.stringify(apiUrl)};var ao=new URL(/^https?:\\/\\//.test(a)?a:"https://"+a).origin;if(location.origin===ao){location.replace(p.replace(/\\/+$/, "")+location.pathname+location.search+location.hash);}}catch(e){}}();`
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
