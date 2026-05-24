import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const watch = process.argv.includes("--watch");

await build({
  entryPoints: [resolve(__dirname, "src/main.ts")],
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  outfile: resolve(__dirname, "dist/app.js"),
  format: "esm",
  target: "es2022",
  logLevel: "info",
});

// Copy static assets to dist.
mkdirSync(resolve(__dirname, "dist"), { recursive: true });
copyFileSync(
  resolve(__dirname, "src/index.html"),
  resolve(__dirname, "dist/index.html")
);
copyFileSync(
  resolve(__dirname, "src/styles.css"),
  resolve(__dirname, "dist/styles.css")
);

console.log("Build complete.");
