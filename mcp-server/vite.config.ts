import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// Bundles the composer View (TS + CSS + the MCP Apps SDK) into ONE self-contained
// HTML file at .vite-ui/index.html. scripts/embed-ui.mjs then inlines that HTML
// into src/ui/composer.generated.ts so the server can serve it as a UI resource
// with no runtime file or CDN dependency.
const root = fileURLToPath(new URL("./src/ui/composer/", import.meta.url));
const outDir = fileURLToPath(new URL("./.vite-ui/", import.meta.url));

export default defineConfig({
  root,
  plugins: [viteSingleFile()],
  build: {
    outDir,
    emptyOutDir: true,
    cssMinify: true,
    minify: true,
    target: "es2020",
  },
});
