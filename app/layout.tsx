import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excel to ARS",
  description: "Convert receipt amounts to ARS directly in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
