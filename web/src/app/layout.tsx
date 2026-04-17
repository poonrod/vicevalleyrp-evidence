import type { Metadata } from "next";
import "./globals.css";
import { HostGuard } from "@/components/HostGuard";

export const metadata: Metadata = {
  title: "Vice Valley Evidence",
  description: "Law enforcement evidence portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HostGuard>{children}</HostGuard>
      </body>
    </html>
  );
}
