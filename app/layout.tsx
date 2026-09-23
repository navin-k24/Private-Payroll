import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple Payment dApp",
  description:
    "Send XLM with a production-style payment flow, live events, and contract-ready architecture.",
  applicationName: "Simple Payment dApp",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  );
}
