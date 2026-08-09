import "./globals.css";
import type { Metadata, Viewport } from "next";
import { COMPANY } from "@/shared/company";

export const metadata: Metadata = {
  applicationName: COMPANY.name,
  authors: [{ name: COMPANY.name }],
  creator: COMPANY.name,
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#1f3a93"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
