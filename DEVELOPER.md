# Development

## Technical background

The frontend restores Valve's own `MiniAchievements` component by supplying the
`onSeek` prop its render guard requires. Do not reimplement the achievement bar
unless a placement Valve's component cannot reach is explicitly required.

The plugin also has a persistent backend settings contract, a reversible
frontend feature lifecycle, runtime version discovery, and a manifest-validated
self-updater. Settings default to achievement restoration enabled, debug logging
disabled, the stable update channel, and automatic update checks enabled. The
QAM settings, updater controls, and all three version rows must remain
independently gamepad-focusable.

The live-verified root cause and runtime constraints are documented in
[`HANDOFF.md`](HANDOFF.md).

## Environment

Allow the repository's direnv configuration before development:

```bash
direnv allow
```

This redirects caches and scratch data to `/tmp/Decky-SteamAchievements`.

Install the exact JavaScript dependency set from `package-lock.json`:

```bash
npm ci
```

Use `npm install --package-lock-only` only when intentionally updating package
metadata or dependency resolution.

## Build and test

```bash
npm test
npx tsc --noEmit
npm run build
uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
```

The frontend build is written to `dist/index.js`. The orchestration gate also
checks source-metadata identity/version agreement and compiles the Python entry
point.

`rollup.config.js` carries the small Decky-compatible build configuration directly. Keep the
React/Decky globals, manifest substitution, asset URL, sourcemap transform, and narrowly scoped
`dist/` cleanup aligned when changing it. The repository intentionally does not depend on
`@decky/rollup`: its unused CommonJS transform and legacy delete chain introduced high-severity
build-only audit findings. Run `npm audit --audit-level=high` after dependency changes.

## Package the plugin

```bash
npm run package
```

This builds the frontend and creates `Decky-SteamAchievements.zip` in the
repository root. Local builds include the current short Git commit as version
metadata.

Install the package with Decky's developer ZIP flow, or deploy `dist/` and the
backend files to `~/homebrew/plugins/Decky-SteamAchievements/` for local testing.
To build, validate, and copy the canonical ZIP to the Deck's Downloads directory
in one step, run `scripts/decky package-push`.

## Build the Desktop installer bundle

The specialized installer sources are under `installer/`. Rebuild the tracked
installer archive after changing any of those files:

```bash
bash installer/build_bundle.sh
```

The command creates `installer/Decky-SteamAchievements Installer.zip`. Keep the
configured GitHub repository URL and exact `Decky-SteamAchievements.zip`
distribution asset aligned with the release workflow. The installer bundle, plugin ZIP, archive
root, and installed directory use `Decky-SteamAchievements`; Decky's plugin list and opened QAM
panel use the manifest display name `Achievements Restored`.

## Release channels

- Every push to `dev` refreshes the replaceable `dev-build` prerelease with one
  `Decky-SteamAchievements.zip` asset. Its packaged version is
  `X.Y.Z-dev.g<sha>`, but the mutable tag has no manifest and is intentionally
  undiscoverable by the in-plugin updater.
- `scripts/request_dev_release.sh X.Y.Z [commit]` validates and dispatches the
  separate manual immutable-development workflow. It publishes a permanent
  `vX.Y.Z-dev.g<sha>` prerelease with the canonical ZIP, checksum, and schema-1
  manifest. Running or publishing it is a deliberate human action, never an
  implementation side effect.
- Stable releases use permanent `vX.Y.Z` tags and add the checksum and release
  manifest alongside the canonical ZIP.
- Stable promotion remains a human gate. Follow
  [`docs/runbooks/release.md`](docs/runbooks/release.md); do not create or push a
  stable tag as an implementation side effect.

## Repository layout

- `src/index.tsx` — plugin entry and QAM content.
- `src/achievementBar.tsx` — achievement restoration and cleanup lifecycle.
- `src/components/` — focusable QAM presentation components.
- `src/controllers/pluginUpdate*` — updater UI state machine and handoff lifecycle.
- `src/runtime/updatePoller.ts` — plugin-scope six-hour background polling.
- `backend/updater/` — pure release discovery, integrity, cache, and pending-install logic.
- `backend/runtime_state.py` — atomic flock-protected updater runtime state.
- `main.py` — settings, updater RPC offload/reconciliation, runtime versions, and lifecycle.
- `installer/` — specialized Desktop installer sources and bundle.
- `.github/workflows/` — CI, rolling and immutable development release, and stable release jobs.
- `scripts/` — build/package/release helpers and the orchestration symlink.
- `docs/` — plans, specifications, reviews, and runbooks.
- `research/` — ignored reverse-engineering scratch; only curated reports and
  diffs are intended to persist.
