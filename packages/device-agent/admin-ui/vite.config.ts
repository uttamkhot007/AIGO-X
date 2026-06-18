import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite dev server runs on port 5174 and proxies
// /admin-api/* → http://127.0.0.1:7979/*  (stripping the /admin-api prefix)
// so App.tsx calls const API = "/admin-api" and both dev and production work:
//
//   Dev:  Vite proxy strips /admin-api, Rust server sees /status, /checks
//   Prod: User opens http://127.0.0.1:7979/   served by Rust admin server
//         API calls go to http://127.0.0.1:7979/admin-api/status (same origin)
//         and the Rust server handles both /status AND /admin-api/status

export default defineConfig({
  plugins: [react()],
  define: {
    // Injected at build time so Wizard.tsx can display the agent version.
    // Declared as `declare const __VERSION__: string` in Wizard.tsx.
    __VERSION__: JSON.stringify(
      process.env.npm_package_version ?? "2.2.0"
    ),
  },
  server: {
    port: 5174,
    proxy: {
      "/admin-api": {
        target: "http://127.0.0.1:7979",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/admin-api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "axios", "zustand"],
          charts: ["recharts"],
        },
      },
    },
  },
});
