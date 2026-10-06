import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          operator: resolve("src/preload/operator.ts"),
          audience: resolve("src/preload/audience.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name]-[hash].cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          operator: resolve("src/renderer/operator.html"),
          audience: resolve("src/renderer/audience.html"),
        },
      },
    },
  },
});
