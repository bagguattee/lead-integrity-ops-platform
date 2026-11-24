import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "IntegrityOps | Multi-Tenant CRM & Lead Integrity Platform",
  description:
    "Enterprise multi-tenant CRM operations firewall with E.164 normalization, DNC cluster quarantine, FinOps circuit breakers, and two-sided reconciliation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[#F4F7FC] text-[#172554] antialiased selection:bg-[#2CE0B6]/30 selection:text-[#0A2472]">
        {children}
      </body>
    </html>
  );
}
