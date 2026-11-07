import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: {
      // Uniquement dans Vite : ces deux flux viennent du même PHP qu'en production.
      "^/robots\\.txt(?:\\?.*)?$": { target: process.env.FUNBIKE_PHP_TARGET || "http://127.0.0.1:8000", changeOrigin: false, rewrite: () => "/server/api/seo-feed.php?feed=robots" },
      "^/sitemap\\.xml(?:\\?.*)?$": { target: process.env.FUNBIKE_PHP_TARGET || "http://127.0.0.1:8000", changeOrigin: false, rewrite: () => "/server/api/seo-feed.php?feed=sitemap" },
      "/server": { target: process.env.FUNBIKE_PHP_TARGET || "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
