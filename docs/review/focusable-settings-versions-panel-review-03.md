# Focusable settings and versions panel review 03

Date: 2026-07-27

Branch: `feat/focusable-settings-versions-panel`

Reviewed commit: `79dfae51fc25fd40c765962407eb91a7759778f3`

Base branch: `dev` at `b7b307b`

## Verdict

Changes are required before merge. The revised distribution/display identity works locally and
the live addendum proves Decky's list and QAM behavior, but the rolling development-release
workflow still invokes the package validator with the superseded manifest-name expectation.
Every push to `dev` would therefore fail before publishing `Decky-SteamAchievements.zip`.

## Blocking finding

### P1 — The `dev-release` workflow rejects the package it just built

`.github/workflows/dev-release.yml:58-61` passes:

```text
--expected-name Decky-SteamAchievements
```

Under the revised contract, `Decky-SteamAchievements` is the archive root/install directory and
`Achievements Restored` is `plugin.json.name`. The validator correctly treats these as separate
arguments, so the workflow's old invocation fails against the current package.

The reviewer built `Decky-SteamAchievements.zip` from `79dfae5` and ran the workflow's exact
validator arguments. It exited 1 with:

```text
Error: plugin.json name 'Achievements Restored' does not match expected 'Decky-SteamAchievements'
```

Required fix:

- update the workflow caller to pass `--expected-root Decky-SteamAchievements` and
  `--expected-name "Achievements Restored"`, matching `release.sh` and
  `check_release_preconditions.sh`, or intentionally rely on the validator's corresponding
  defaults; and
- add or extend a local gate that exercises the real development-workflow validation contract so
  this caller cannot drift while all local quality gates remain green.

## Identity and migration review

The rest of the revised split is internally consistent:

- `plugin.json`, `definePlugin().name`, and `titleView` use the Decky display name.
- `package.json`, ZIP filename/root, installed and settings directories, log namespace, Desktop
  installer, and release asset retain the `Decky-SteamAchievements` distribution identity.
- `package.mjs` fixes the archive root independently of `plugin.json.name` and emits release
  metadata with the display `pluginName`, canonical asset name, npm package name, version, tag,
  channel, and digest.
- The validator separates `--expected-root` from `--expected-name`; local, stable-release, release
  precondition, and post-commit callers are aligned.
- The Desktop installer recognizes the former manifest name only for the exact canonical
  folder/current-display package combination, detects ambiguous duplicate installations, replaces
  the canonical folder in place, and migrates/deduplicates `pluginOrder` while preserving order.
- Installer tests cover the current and legacy manifest lookup, plugin-order migration, stable
  source selection, rollback, and privileged-plan rejection.
- Current documentation explains the Storage Cleaner-style distribution/display split without
  changing the canonical install, settings, or release paths.

## Independent automated verification

All local plan gates passed at the reviewed commit:

- `npm test`: 5 files and 68 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: production Rollup build passed.
- `python3 -m py_compile main.py`: passed.
- `uv run --with pytest -- pytest -q`: 13 tests passed.
- `scripts/orchestration/run-quality-gates`: passed source metadata, identity, installer bundle,
  typecheck, production build, frontend tests, Python compilation/tests, and version drift.
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.
- `git status --short`: clean before this review note was created.

Additional artifact checks passed:

- default package validation of `Decky-SteamAchievements.zip`;
- explicit validation with canonical archive root, display manifest name, and version `0.1.0`;
- installer archive entry and byte-parity validation;
- source metadata and identity validation;
- release-manifest JSON inspection and checksum verification.

The green local gates do not clear the branch because none currently executes the stale
development-workflow caller described above.

## Live evidence assessment

The display-name migration addendum records the exact `0.1.0+59341a5` build and covers the only
runtime behavior changed after the prior full smoke: the canonical archive installed into the
existing distribution directory, Decky registered exactly one display entry, both the list and
opened QAM used the requested title, settings remained under the canonical directory, the loader
stayed active, and the game-details page retained exactly one restored row. Commit `79dfae5` adds
only that evidence. This is sufficient device evidence for the revised identity split.

STATUS: CHANGES_REQUESTED
