import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Choc Bites", template: "%s · Choc Bites" },
  description: "Gestão do desafio de vendas: vendas, estoque, produção, caixa e resultado.",
  applicationName: "Choc Bites",
  // iPhone: ao adicionar à tela inicial, abre como aplicativo, com o nome e a logo da Choc Bites.
  appleWebApp: { capable: true, title: "Choc Bites", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf0e2" },
    { media: "(prefers-color-scheme: dark)", color: "#1e0f09" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
