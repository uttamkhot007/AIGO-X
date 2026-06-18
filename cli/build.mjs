import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await rm(path.join(__dirname, "dist"), { recursive: true, force: true });

await esbuild({
  entryPoints: [path.join(__dirname, "src/index.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.join(__dirname, "dist"),
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  sourcemap: "linked",
  external: ["*.node"],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
});
