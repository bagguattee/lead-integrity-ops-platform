import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Integrity Ops Platform | Multi-Tenant CRM Operations",
  description: "Enterprise lead integrity, reconciliation, deduplication, and FinOps circuit breaker SaaS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
