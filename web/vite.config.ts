import path from "node:path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // В контейнере слушать loopback бесполезно — снаружи порт не виден.
    host: true,
    // Полезная нагрузка HMR ходит по тому же порту, что и страница;
    // без явного указания клиент в браузере пытается стучаться в контейнерный хост.
    watch: { usePolling: false },
    proxy: {
      // Демон живёт в целевом окружении (контейнер target), а не рядом с dev-сервером.
      "/api": {
        target: process.env.METABOX_API_TARGET ?? "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/healthz": {
        target: process.env.METABOX_API_TARGET ?? "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
