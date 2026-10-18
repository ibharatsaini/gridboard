import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Browser config lives in apps/web/.env (see .env.example there); only VITE_-prefixed variables reach the bundle.
  // Deliberately NOT the repo-root .env: that file is the API's, and its NODE_ENV=development would turn
  // `vite build` into a development build (unminified React, ~2x the bytes).
  // The API's WEB_URL must equal this origin (CORS and Origin checks).
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    sourcemap: true,
    target: "es2023",
    rolldownOptions: {
      output: {
        // Stable vendor chunks: shipping an app change does not invalidate the browser's cached React / motion /
        // socket.io, which together are most of the bytes.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/, priority: 20 },
            { name: "realtime", test: /node_modules[\\/](socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser|@socket\.io)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
