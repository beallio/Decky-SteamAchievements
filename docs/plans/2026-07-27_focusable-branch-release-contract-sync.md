# Plan: Synchronize the focusable-settings branch with the release contract

## Objective

Bring the living documentation, package-manager metadata, installer guidance, and generated
installer bundle on `feat/focusable-settings-versions-panel` into agreement with the canonical
`Decky-SteamAchievements` packaging and GitHub release system now present on `dev`.

## Scope

- Preserve the display name `Achievements Restored` and canonical identity
  `Decky-SteamAchievements` / `decky-steamachievements`.
- Resolve the committed conflict markers in `AGENTS.md` while retaining both the runtime-feature
  guidance and the canonical identity contract.
- Use npm commands consistently in current contributor guidance and remove stale pnpm-only
  package metadata.
- Document the settings/version panel, stable and rolling release channels, exact ZIP names, and
  the human stable-release gate.
- Update the unreleased first-release notes without rewriting any published history; no stable
  tag or release exists yet.
- Keep the user-facing installer bundle name `Achievements Restored Installer.zip`, update its
  embedded guidance, and rebuild it from the adjacent sources.
- Leave historical plans, review notes, and implementation session records unchanged.

## Tasks

1. Update `package.json` and regenerate/validate `package-lock.json` without changing dependency
   versions or any identity/version field.
2. Update `README.md`, `DEVELOPER.md`, `AGENTS.md`, `.envrc`, `CHANGELOG.md`, and the installer
   README to the current package/release/runtime contracts.
3. Rebuild the tracked installer archive and verify its embedded distribution asset and README.
4. Record the cleanup and remaining human/device gates in a session log.

## Verification

- `npm install --package-lock-only` changes no dependency resolution.
- Source metadata agreement and canonical/display identities pass.
- No live tracked file outside historical/audit artifacts names `Achievements Restored.zip`,
  recommends pnpm, or contains conflict markers.
- The installer archive contains the expected three payload files, embeds
  `DISTRIBUTION_ASSET = "Decky-SteamAchievements.zip"`, and matches its source files.
- `npm test`, `npx tsc --noEmit`, `npm run build`, Python compilation/tests,
  `scripts/orchestration/run-quality-gates`, review-note integrity, and `git diff --check` pass.

