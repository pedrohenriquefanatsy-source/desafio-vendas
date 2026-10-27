import type { NextConfig } from "next";

// Cache Components desligado de propósito: números financeiros e de estoque
// sempre vêm do banco na hora, sem cache de página entre requisições.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
