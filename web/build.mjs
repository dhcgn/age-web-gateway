import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

// Service worker: bundled separately (never hashed — browsers byte-compare
// sw.js for updates) and served from the site root for full scope.
await build({
  entryPoints: [resolve(__dirname, "src/sw.ts")],
  bundle: true,
  minify: !watch,
  outfile: resolve(__dirname, "dist/sw.js"),
  format: "iife",
  target: "es2022",
  logLevel: "info",
});

// Copy static assets to dist.
// Note: plain read/write instead of copyFileSync, which uses copy_file_range
// and fails with EPERM when overwriting files on Windows bind mounts
// (e.g. Docker Desktop devcontainers).
function copyFile(src, dest) {
  writeFileSync(dest, readFileSync(src));
}

mkdirSync(resolve(__dirname, "dist"), { recursive: true });
copyFile(
  resolve(__dirname, "src/index.html"),
  resolve(__dirname, "dist/index.html")
);
copyFile(
  resolve(__dirname, "src/styles.css"),
  resolve(__dirname, "dist/styles.css")
);
copyFile(
  resolve(__dirname, "src/manifest.webmanifest"),
  resolve(__dirname, "dist/manifest.webmanifest")
);
// PNG sources of truth live in brands/ (see brands/generate-png.sh).
for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon-180.png"]) {
  copyFile(resolve(__dirname, "src", icon), resolve(__dirname, "dist", icon));
}

console.log("Build complete.");
