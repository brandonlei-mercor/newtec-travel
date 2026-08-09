import type { ReactNode } from "react";
import type { Metadata } from "next";
import { COMPANY } from "@/shared/company";
import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Requests | ${COMPANY.name}`,
  description: "Customer requests waiting for a callback.",
  robots: { index: false, follow: false, nocache: true }
};

/*
 * The back office is staff-only and English-only, so it sits outside the locale
 * segment and renders its own document. Nothing here is translated: the people
 * reading it are the two who run the agency.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
