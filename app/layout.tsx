import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mystic Essence | Perfumaria Árabe",
  description: "Mockup ecommerce para Mystic Essence, perfumaria árabe em Santa Maria da Feira.",
  icons: {
    icon: { url: "/favicon.png", type: "image/png", sizes: "192x192" },
    shortcut: "/favicon.png",
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
