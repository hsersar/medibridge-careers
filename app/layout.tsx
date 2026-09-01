import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediBridge Careers",
  description: "Your trusted path to a healthcare career in Germany.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
