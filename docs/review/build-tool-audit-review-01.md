# Build tool audit review 01

Date: 2026-07-27

Branch: `fix/build-tool-audit`

Reviewed commit: `a881d6c14da6cdabfd80dfd6e630bd39ca43556f`

Base branch: `dev` at `4ee03358b00d1ade235a90cf97d0d7c5b799eed5`

## Verdict

The branch is clear to merge into `dev`. It removes the vulnerable `@decky/rollup` dependency
chain without changing the generated plugin bundle, preserves the preset behavior required by
this repository, constrains cleaning to the repository's resolved `dist` path, and passes fresh
install, audit, dependency-tree, quality-gate, and package-validation checks.

## Dependency and audit review

A fresh install using the repository's `/tmp` npm cache added 147 packages and reported zero
vulnerabilities. Independent follow-up checks passed:

- `npm audit --audit-level=high`: zero vulnerabilities, exit 0.
- `npm ls --all`: complete dependency tree, exit 0.
- `package-lock.json` contains no `@decky/rollup`, `@rollup/plugin-commonjs`,
  `rollup-plugin-delete`, or former `glob`/`minimatch`/`brace-expansion`/`rimraf`/`del` chain.

The direct Rollup plugins are locked at the versions selected by the implementation. The only
npm output outside normal success messages was the existing unsupported user-configuration
warning.

## Preset parity and bundle evidence

The reviewer independently fetched and inspected the published `@decky/rollup@1.0.2` package.
The new direct configuration preserves its input, TypeScript and JSON transforms, browser node
resolution, external globals and manifest substitution, environment replacement, asset public
path, external modules, tree-shaking policy, output format, source maps, source-map path
transformation, and default export behavior.

The omitted preset behavior is intentional and unnecessary here:

- `@rollup/plugin-commonjs` has no CommonJS input to transform in the plugin source, and the
  production output is byte-identical without it.
- `rollup-plugin-delete` is replaced by the fixed-path `clean-dist` hook.
- `merge-anything` is unnecessary because the repository does not merge caller-supplied Rollup
  overrides into the preset.

The saved pre-audit artifacts remained available and were compared directly. Both byte-for-byte
comparisons passed, with matching SHA-256 hashes:

```text
8ed072ac3d1e49a7d296de5aef52da412e670877793bd98c67839780d86567d2  index.js
e9b89e205723e8258b5f1fbc44d435ad646c1ed2b709a6b3f0ba913b4c278be2  index.js.map
```

## Clean target safety

The cleaner derives `repoRoot` from `import.meta.url` for the checked-in config file and resolves
only `path.join(repoRoot, "dist")`; no environment variable, working-directory value, glob, or
caller input can broaden the deletion target.

The reviewer also exercised the symlink boundary: repository `dist` was temporarily replaced by
a symlink to an external `/tmp` directory containing a sentinel. A production build removed the
symlink, recreated repository `dist` as a real directory, and left both the external directory
and sentinel intact. The rebuilt output retained the two pre-audit hashes above.

## Independent verification

The following checks passed from the reviewed branch:

- fresh `npm ci` with the repository `/tmp` cache;
- `npm audit --audit-level=high`;
- `npm ls --all`;
- `scripts/orchestration/run-quality-gates`, including source metadata, identity, installer
  bundle, typecheck, production build, 68 frontend tests, Python compilation, 13 backend tests,
  version drift, and retained review notes;
- `npm run package`, producing packaged version `0.1.0+a881d6c`;
- `python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip`;
- `git diff --check dev...HEAD`;
- clean `git status --short` before this review note was created.

STATUS: APPROVED
