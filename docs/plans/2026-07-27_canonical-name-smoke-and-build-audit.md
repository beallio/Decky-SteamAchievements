# Canonical name, live smoke test, and build-audit completion

## Objective

Finish `feat/focusable-settings-versions-panel` under the revised identity contract: use
`Decky-SteamAchievements` for the repository, distribution ZIP/root, installed directory,
documentation, installer, backend namespace, and release artifacts. Use `Achievements Restored`
as the `plugin.json` display identity shown in Decky's plugin list and as the QAM title supplied by
`src/index.tsx`. Prove the feature on the Steam Deck, merge the reviewed branch
into `dev`, remediate the JavaScript build-tool audit on a separate fix branch, then promote the
verified `dev` head to `main` without creating a stable tag or release.

## Scope

### In scope

- Canonicalize current documentation, installer filenames/content, backend log labels, helper
  descriptions, and test-only identity strings.
- Rebuild and inspect the tracked SteamOS Desktop installer bundle.
- Migrate the live development install from the old plugin/settings directories to canonical
  directories with recoverable backups.
- Run the feature plan's seven-item live smoke-test matrix.
- Resolve the independent review loop and merge the feature branch into `dev`.
- Remove the reported high-severity build-only dependency chain while preserving Rollup output.
- Merge the audit fix into `dev`, then merge `dev` into `main` and push both branches.

### Out of scope

- Changing the Decky list/QAM display title `Achievements Restored` to another value.
- Changing the canonical `package.json` name, distribution archive/root, or installed directory.
- Creating or pushing any `v*` tag or publishing a stable release.
- Modifying `orchestration.conf.local`, force-pushing, or changing sibling repositories.

## Implementation tasks

1. Record clean branch state, a green frontend/backend baseline, the current audit graph, and the
   live Deck plugin/settings/installer layout.
2. Rename the Desktop bundle, launcher, and extracted helper directory to
   `Decky-SteamAchievements`; update the launch path and installer prose; rebuild the archive.
3. Keep product/documentation/distribution references canonical while using the display title only
   for `plugin.json`, the Decky list/QAM frontend constants, and explicit identity documentation.
4. Add automated identity and installer-archive assertions so future drift fails locally and in
   CI.
5. Package and deploy the feature build. Preserve the live old-name plugin and settings as
   timestamped backups until the smoke test passes; activate the canonical install and settings.
6. Run every manual smoke-test item from
   `docs/plans/2026-07-26_focusable-settings-versions-panel.md` and capture evidence.
7. Resolve the independent reviewer findings, rerun the complete automated gates, and request a
   final independent review of the resulting commit.
8. Merge the cleared feature branch to `dev`, push it, and wait for all triggered GitHub Actions
   runs with exit-status enforcement.
9. Create `fix/build-tool-audit` from the updated `dev`. Replace or constrain the vulnerable
   build-only chain based on the published dependency graph; do not change runtime dependencies.
10. Prove audit remediation, output parity, full gates, and package validity; commit atomically,
    merge and push to `dev`, and wait for CI.
11. Merge the verified `dev` head into `main`, push `main`, and wait for CI. Confirm no stable tag
    or stable release was created.

## Verification

### Automated feature/naming gates

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `uv run --with pytest -- pytest -q`
- `scripts/orchestration/run-quality-gates`
- `npm run package` followed by `python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip`
- Inspect `installer/Decky-SteamAchievements Installer.zip` to require exactly the canonical
  launcher/helper paths and byte parity with their sources.
- A tracked-text identity check must reject `Achievements Restored` outside `plugin.json`, the
  Decky list/QAM frontend constants, and text that explicitly documents those display surfaces.

### Live feature gates

Run the seven smoke checks in the focusable-settings plan: independent gamepad focus, correct
three-version display, immediate off behavior, clean on behavior, persistence/no startup flash,
debug-log persistence/filtering, and rapid-toggle/failure/dismount resilience.

### Build-audit gates

- `npm audit --audit-level=high` exits zero.
- `npm ls --all` exits zero.
- Full automated feature/naming gates remain green.
- The production bundle and plugin ZIP validate after a clean dependency install.

### Remote integration gates

- Push feature and audit branches normally; never force-push.
- Merge each cleared changeset to `dev` with a non-fast-forward merge and push `dev`.
- Use `gh run watch --exit-status` for every workflow run triggered by those pushes and the final
  `main` push.
- Confirm `origin/dev` and `origin/main` point at their intended merge commits, `dev-build` is the
  only movable release tag, and no stable release was created.

## Commit strategy

- Feature branch: separate canonical-name/installer, tests, and documentation/session commits.
- `fix/build-tool-audit`: dependency/config remediation and its documentation as distinct commits
  where independently testable.
- `dev` and `main`: explicit non-fast-forward merge commits; no direct implementation commits.
