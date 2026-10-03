import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Tauri expects a fixed dev port and wants to see its own logs.
export default defineConfig({
  // Preact, with libraries that import "react" (TipTap, zustand) pointed at preact/compat.
  plugins: [preact()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  // A desktop bundle loaded from disk; one chunk is fine.
  build: { chunkSizeWarningLimit: 1500 },
});
