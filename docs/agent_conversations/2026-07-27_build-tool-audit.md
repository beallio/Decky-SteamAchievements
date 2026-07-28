# Build-tool dependency audit remediation

Date: 2026-07-27

Branch: `fix/build-tool-audit`

Base: verified `dev` merge `4ee0335`

## Finding review

`npm audit` initially reported eight high-severity findings. They were entirely in the frontend
build graph, not shipped plugin runtime code:

- direct preset: `@decky/rollup@1.0.2` (the latest published version, with no audit fix);
- unused transform path: `@rollup/plugin-commonjs` → `glob` → `minimatch` → `brace-expansion`;
- cleanup path: `rollup-plugin-delete` → `del` → `rimraf` → `glob` → `minimatch` →
  `brace-expansion`.

The preset itself is a small Rollup configuration. The plugin source and its ESM dependencies do
not require the CommonJS transform. The only behavior supplied by the vulnerable delete chain was
removing `dist/` before a build.

## Remediation

- Removed `@decky/rollup`, `@rollup/plugin-commonjs`, `rollup-plugin-delete`, `del`, `rimraf`,
  `glob`, `minimatch`, `brace-expansion`, and the preset-only merge dependency from the graph.
- Promoted the safe Rollup plugins already used by the preset to explicit, exact development
  dependencies.
- Reproduced the preset directly in `rollup.config.js`, preserving plugin order, Decky/React
  globals, manifest substitution, asset public path, treeshaking, and sourcemap path rewriting.
- Replaced the delete plugin with a local `clean-dist` hook that removes only the resolved
  repository `dist/` directory through Node's built-in `rmSync`.

## Verification evidence

- A sentinel file placed under `dist/` was removed by the next build, proving the replacement
  cleaner executes and is narrowly scoped.
- Before/after production output matched byte-for-byte:
  - `dist/index.js`: `8ed072ac3d1e49a7d296de5aef52da412e670877793bd98c67839780d86567d2`
  - `dist/index.js.map`: `e9b89e205723e8258b5f1fbc44d435ad646c1ed2b709a6b3f0ba913b4c278be2`
- `npm ci` installed 147 packages and reported zero vulnerabilities.
- `npm audit --audit-level=high` exited zero with zero vulnerabilities.
- `npm ls --all` exited zero; the former vulnerable packages are absent from the graph.
- The production build after the clean install retained byte-for-byte bundle and sourcemap parity.

The full frontend/backend, packaging, identity, installer, and orchestration gates are run again
before merging this branch.
