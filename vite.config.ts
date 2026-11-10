import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        // Grouper les petits modules partagés évite des dizaines de requêtes
        // au premier chargement, sans inclure les pages non visitées.
        manualChunks(id) {
          const relative = id.split("?")[0].replace(/\\/g, "/");
          if (relative.startsWith(`${__dirname.replace(/\\/g, "/")}/src/catalog/`)) return "catalog-core";
          if (/\/src\/components\/(?:Layout|SmartImage|Cards|AccessoryBrands)\.tsx$/.test(relative)) return "public-cards";
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
