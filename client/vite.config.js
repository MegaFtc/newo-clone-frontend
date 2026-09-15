import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В деве Vite сам проксирует /api на Express-сервер (порт 3000), чтобы не
// упираться в CORS при локальной разработке. В проде собранный build
// раздаёт сам Express (см. server/server.js), прокси не нужен.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
