import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excel a ARS",
  description: "Converti montos de comprobantes a ARS directamente en tu navegador.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
