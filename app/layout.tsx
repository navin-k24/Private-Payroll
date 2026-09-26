import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight Private Payroll | Zero-Knowledge Confidential Payments",
  description:
    "Confidential payroll compliance and salary verification powered by Midnight Compact smart contracts.",
  applicationName: "Midnight Private Payroll",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className="min-h-full bg-[var(--background)] text-[var(--foreground)] antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
