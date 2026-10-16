import "./globals.css";
import "./landing.css";
import "./redesign.css";
import type { ReactNode } from "react";

export const metadata = { title: "Rewind: chat with your documents", description: "Ask questions about your documents and get answers with citations" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@400;500&family=Instrument+Serif:ital@0;1&family=Syne:wght@800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}