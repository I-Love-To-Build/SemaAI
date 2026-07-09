import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sema Studio Contributor Platform",
  description: "Production contributor portal for Kenyan language text, speech, review, and dataset operations."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}