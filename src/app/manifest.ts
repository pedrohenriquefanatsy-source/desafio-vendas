import type { MetadataRoute } from "next";

// Faz o site poder ser instalado no celular ("Adicionar à tela inicial") com a logo da Choc Bites.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Choc Bites · Desafio de vendas",
    short_name: "Choc Bites",
    description: "Vendas, estoque, produção, caixa e faturamento do desafio.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf0e2",
    theme_color: "#faf0e2",
    icons: [
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icone-mascaravel-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
