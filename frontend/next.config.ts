import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // build enxuto para a imagem Docker (frontend/Dockerfile); não muda o `next dev`
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
