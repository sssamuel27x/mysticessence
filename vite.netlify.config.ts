import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(process.cwd(), "netlify"),
  publicDir: resolve(process.cwd(), "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "next/image": resolve(process.cwd(), "netlify/image-shim.tsx"),
      "next/link": resolve(process.cwd(), "netlify/link-shim.tsx"),
    },
  },
  build: {
    outDir: resolve(process.cwd(), "netlify-dist"),
    emptyOutDir: true,
  },
});
