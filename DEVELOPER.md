# Development

## Technical background

The frontend restores Valve's own `MiniAchievements` component by supplying the
`onSeek` prop its render guard requires. Do not reimplement the achievement bar
unless a placement Valve's component cannot reach is explicitly required.

The live-verified root cause and runtime constraints are documented in
[`HANDOFF.md`](HANDOFF.md).

## Environment

Allow the repository's direnv configuration before development:

```bash
direnv allow
```

This redirects caches and scratch data to `/tmp/Decky-SteamAchievements`.

Install JavaScript dependencies with either package manager:

```bash
pnpm install
# or
npm install
```

## Build and test

```bash
pnpm test
pnpm run build
```

The frontend build is written to `dist/index.js`. Backend tests can be run with:

```bash
uv run --with pytest pytest -q
```

## Package the plugin

```bash
pnpm run package
```

This builds the frontend and creates `Achievements Restored.zip` in the repository
root. Local builds include the current short Git commit as version metadata.

Install the package with Decky's developer ZIP flow, or deploy `dist/` and the
backend files to `~/homebrew/plugins/Decky-SteamAchievements/` for local testing.

## Build the Desktop installer bundle

The specialized installer sources are under `installer/`. Rebuild the tracked
installer archive after changing any of those files:

```bash
bash installer/build_bundle.sh
```

The command creates `installer/Achievements Restored Installer.zip`. Keep the
configured GitHub repository URL and exact `Achievements Restored.zip` release
asset name aligned with the release workflow.

## Repository layout

- `src/index.tsx` — plugin entry and QAM content.
- `src/achievementBar.tsx` — achievement restoration and cleanup lifecycle.
- `src/components/` — focusable QAM presentation components.
- `main.py` — settings, runtime versions, and backend lifecycle.
- `installer/` — specialized Desktop installer sources and bundle.
- `scripts/` — build/package helpers and the orchestration symlink.
- `docs/` — plans, specifications, reviews, and runbooks.
- `research/` — ignored reverse-engineering scratch; only curated reports and
  diffs are intended to persist.
