# AGENTS.md — Achievements Restored

Guidance for coding agents working in this repo. Keep it current.

## What this is

A Decky Loader plugin that restores the achievement progress bar Valve removed
from the Steam Deck game-details page. The fix is **frontend**: re-render Valve's
own `MiniAchievements` component by supplying the `onSeek` prop its guard needs.
Do **not** reimplement the bar unless a placement Valve's component can't reach
is explicitly required.

Authoritative background: `HANDOFF.md` (root cause, live-verified) and
`research/diffs/removal_onSeek_guard.md` (the one-line diff + bisect).

## Environment & scratch

- `direnv allow` loads `.envrc`, which points all caches/scratch at
  `/tmp/Decky-SteamAchievements` (`TMPDIR`, `XDG_CACHE_HOME`, `npm_config_cache`,
  `PYTHONPYCACHEPREFIX`). Keep exploratory/large files there, never in the repo.
- `research/` is gitignored; only curated reports under `research/reports` and
  `research/diffs` are meant to persist.

## Build / test

- `pnpm install` (or `npm install`) then `pnpm run build` (rollup via `@decky/rollup`).
- `pnpm run package` builds and zips via `scripts/package.mjs`.
- `pnpm test` runs vitest.
- `scripts/check_tdd.sh` enforces a matching test for new `src/*.py` (backend).

## Decky runtime facts (for the patch)

- Steam contexts are split: DOM/React fibers live in the **Big Picture** window;
  `webpackChunksteamui` / `SP_REACT` / stores live in **SharedJSContext**.
- Require capture: `webpackChunksteamui.push([[k],{},r=>R=r])`; use `R.m` +
  `R(id)` (the `R.c` cache reads empty via that handle).
- Achievements store: `R(78057).H.GetAchievements(appid)` → `{nTotal,nAchieved,…}`
  (id is build-specific — resolve by signature, not hardcode).
- `afterPatch(MiniAchievements.prototype, "render", …)` works on the current
  build. Supply `onSeek` through a persistent instance `props` getter, then
  schedule `forceUpdate()` out of band so React commits Valve's component.
- Capture the class read-only from SharedJSContext through `g_PopupManager` →
  Big Picture document → React fiber DFS, matching the whole class source by
  `onSeek("achievements")`.
- Defer capture until after the app-details route commits, then refresh captured
  `MiniAchievements` instances; synchronous route-render capture sees the old tree.
- `routerHook.addPatch()` transforms the route table; its callback is not a
  navigation/render event and cannot drive later capture retries by itself.
- Use an untouched `children.props.renderFunc` after-patch only as the per-render
  signal, then defer capture and retry briefly until the Big Picture commit is visible.
- Never tree-descend or use `wrapReactClass` for this patch: wrapping remounts
  app-details components, exposes the store-tabs variant, and breaks the play-row
  gradient.
- Match components by stable signatures, not minified locals or hashed
  classnames — those churn every Steam update.

## Orchestration

- `scripts/orchestration` symlinks the shared engine (`../../agent-orchestration`).
- `orchestration.conf` is committed; `orchestration.conf.local` is gitignored and
  wins (local `dev` base branch, `ORCH_LOCAL_ONLY=1`).

## Conventions

- TypeScript/TSX for frontend under `src/`; Python backend in `main.py`/`backend/`.
- Terse, factual commit messages; do not add Claude/AI trailers.
- Prefer resilient lookups and graceful failure — a broken patch must never crash
  the Steam UI (wrap in try/catch, log, no-op on failure).

## Plugin identity — canonical vs display

Two names, deliberately different. Do not "unify" them.

- **Canonical: `Decky-SteamAchievements`** — matches the repository name. Lives in `plugin.json`
  `name`, and lowercase-kebab in `package.json` (`decky-steamachievements`). This string is
  load-bearing: `scripts/package.mjs` derives the packaged folder name and zip filename from
  `plugin.json` `name`, Decky Loader keys the installed plugin directory
  (`~/homebrew/plugins/Decky-SteamAchievements/`) off it, and any self-updater must pass it
  verbatim to `install_plugin` to replace in place rather than installing a second copy.
- **Display: `Achievements Restored`** — what the user sees. Lives in `src/index.tsx` as
  `PLUGIN_NAME`, used for the `definePlugin` `name` and the QAM `titleView`. Also the product
  name in `README.md`/`AGENTS.md` titles and the installer's user-facing artifacts.

Changing the canonical name changes the on-device install directory and the release asset
filename, and breaks in-place updates for anyone already running the plugin. Treat it as a
breaking change, not a rename.

Note the sibling `Decky-Metadata` has these two out of sync — its `AGENTS.md` says the canonical
name has no space while its shipped `plugin.json` has one. That is a known open issue there; do
not copy its current state as a pattern.
