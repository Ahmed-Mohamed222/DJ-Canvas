import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Standalone SPA build for Electron packaging.
// Outputs dist-electron/ with a real index.html that loads via file://.
export default defineConfig({
  root: path.resolve(__dirname, "electron-app"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-electron"),
    emptyOutDir: true,
    target: "chrome120",
  },
});
