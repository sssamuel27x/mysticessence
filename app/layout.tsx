import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mystic Essence | Perfumaria Árabe",
  description: "Mockup ecommerce para Mystic Essence, perfumaria árabe em Santa Maria da Feira.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
