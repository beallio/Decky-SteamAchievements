import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import { defineConfig } from "rollup";
import externalGlobals from "rollup-plugin-external-globals";
import importAssets from "rollup-plugin-import-assets";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "plugin.json"), "utf8"));
const distPath = path.join(repoRoot, "dist");

function cleanDist() {
  return {
    name: "clean-dist",
    buildStart() {
      rmSync(distPath, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  input: "./src/index.tsx",
  plugins: [
    cleanDist(),
    typescript(),
    json(),
    nodeResolve({ browser: true }),
    externalGlobals({
      react: "SP_REACT",
      "react/jsx-runtime": "SP_JSX",
      "react-dom": "SP_REACTDOM",
      "@decky/ui": "DFL",
      "@decky/manifest": JSON.stringify(manifest),
    }),
    replace({
      preventAssignment: false,
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
    }),
    importAssets({
      publicPath: `http://127.0.0.1:1337/plugins/${manifest.name}/`,
    }),
  ],
  context: "window",
  external: ["react", "react-dom", "@decky/ui"],
  treeshake: {
    pureExternalImports: {
      pure: ["@decky/ui", "@decky/api"],
    },
    preset: "smallest",
  },
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    sourcemapPathTransform: (relativeSourcePath) =>
      relativeSourcePath.replace(
        /^\.\.\//,
        `decky://decky/plugin/${encodeURIComponent(manifest.name)}/`,
      ),
    exports: "default",
  },
});
