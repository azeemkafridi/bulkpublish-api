// Builds every widget View under src/ui/<name>/ into its own self-contained
// single-file HTML at .vite-ui/<name>/index.html.
//
// vite-plugin-singlefile forces output.inlineDynamicImports, which rollup does
// NOT allow with multiple inputs — so we run one single-input Vite build per
// widget. Adding a widget needs no change here: just create src/ui/<name>/index.html.
// scripts/embed-ui.mjs then inlines every built widget into src/ui/widgets.generated.ts.
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const uiRoot = fileURLToPath(new URL("../src/ui/", import.meta.url));
const outRoot = fileURLToPath(new URL("../.vite-ui/", import.meta.url));

rmSync(outRoot, { recursive: true, force: true });

const widgets = readdirSync(uiRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of widgets) {
  await build({
    root: uiRoot,
    configFile: false,
    plugins: [viteSingleFile()],
    logLevel: "warn",
    build: {
      outDir: outRoot,
      emptyOutDir: false, // cleared once above; preserve siblings across the loop
      cssMinify: true,
      minify: true,
      target: "es2020",
      rollupOptions: { input: { [name]: `${uiRoot}${name}/index.html` } },
    },
  });
  console.error(`[build-ui] built ${name}`);
}
