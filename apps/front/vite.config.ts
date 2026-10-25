import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: process.env.ATHLORE_E2E_BACKEND_PORT
      ? {
          "/api": {
            target: `http://127.0.0.1:${process.env.ATHLORE_E2E_BACKEND_PORT}`,
            changeOrigin: false
          }
        }
      : undefined
  },
  test: {
    css: true,
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    testTimeout: 20000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"]
  }
});
