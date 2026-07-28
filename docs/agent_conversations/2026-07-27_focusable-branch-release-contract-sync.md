# Focusable branch release-contract synchronization

Date: 2026-07-27

Branch: `feat/focusable-settings-versions-panel`

## Work completed

- Merged current `dev` so the feature branch retains the completed CI/release workflows,
  release scripts, runbook, verification record, and canonical lockfile identity.
- Removed stale pnpm-only package metadata and standardized living contributor guidance on npm.
- Resolved committed conflict markers in `AGENTS.md` while preserving both the focusable-settings
  runtime rules and canonical/display identity contract.
- Updated the README and developer guide for the settings/version panel, canonical
  `Decky-SteamAchievements.zip`, rolling `dev-build` prerelease, and human-gated stable channel.
- Consolidated all not-yet-published work into the curated `0.1.0` changelog entry. No published
  changelog history was rewritten because the repository still has no stable tag or release.
- Updated the desktop installer's embedded README and rebuilt its tracked archive. A subsequent
  naming decision renamed it to `installer/Decky-SteamAchievements Installer.zip`; it embeds the exact
  canonical distribution asset `Decky-SteamAchievements.zip` and intentionally ignores
  prereleases.

## Verification

- Source metadata agreement passed with canonical `Decky-SteamAchievements` and package
  `decky-steamachievements`; `package-lock.json` did not change dependency resolution.
- Frontend: 60 Vitest tests passed, TypeScript typecheck passed, and the Rollup build passed.
- Backend: 7 pytest tests passed; `main.py` and the desktop installer compiled successfully.
- The project orchestration quality gate and review-note deletion check passed.
- A release-mode `Decky-SteamAchievements.zip` built and passed the package validator at version
  `0.1.0`.
- The installer ZIP passed archive integrity checks, contained only its expected payload, and
  byte-matched all three source files embedded in it.
- Current, non-historical tracked content contains no conflict markers, stale display-name
  plugin asset, or pnpm contributor commands.
- `git diff --check` passed after removing an extra newline from the sync plan.

## Remaining gates and follow-up

1. The feature implementation still needs an independent code review; no review note exists yet.
2. The plan's on-device smoke test remains outstanding: gamepad focus, displayed runtime
   versions, live disable/re-enable behavior, persistence across Decky restart, diagnostics, and
   rapid-toggle/failure behavior must be exercised on a Steam Deck.
3. The desktop installer intentionally selects only a stable release. It will remain unable to
   install until a human promotes `dev` to `main`, runs `scripts/release.sh 0.1.0`, and publishes
   the printed stable tag push.
4. `npm audit` reports eight high-severity build-tool findings rooted in `@decky/rollup` and its
   transitive Rollup cleanup/glob stack. The direct package currently has no complete automated
   fix. Handle this in a separate dependency/toolchain review rather than running an unreviewed
   lockfile rewrite.
