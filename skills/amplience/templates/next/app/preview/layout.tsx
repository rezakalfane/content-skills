import type { Metadata } from "next";
import { body, display } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Root layout for Amplience visualizations: the content only, without the site chrome. */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
