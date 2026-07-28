# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release entries are curated by hand and dated. A release must not be cut against an
`[Unreleased]` heading — roll it over to the version being released first.

## [Unreleased]

## [0.1.0] - 2026-07-27

Initial development release.

### Added

- Restores the achievement progress bar Valve removed from the Steam Deck
  game-details PlayBar by supplying the `onSeek` prop its `MiniAchievements`
  component requires, without remounting Steam's content components.
- Persistent, gamepad-focusable toggles for achievement restoration and debug
  logging, including reversible cleanup of the currently mounted bar.
- Independently focusable plugin, Decky Loader, and SteamOS version rows.
- A SteamOS desktop installer bundle that validates and installs the canonical
  stable plugin ZIP with backup and rollback handling.
- CI, a rolling `dev-build` prerelease, fail-closed package validation, and a
  human-gated stable release workflow.

### Changed

- Canonical plugin identity pinned to `Decky-SteamAchievements` (the repository name) in
  `package.json` and the distribution archive/install path, while `plugin.json` uses
  `Achievements Restored` for Decky's plugin list and QAM title.
  The contract is documented in `AGENTS.md`.
- On-device install directory is now `~/homebrew/plugins/Decky-SteamAchievements/`, and the
  packaged release asset is `Decky-SteamAchievements.zip`. `scripts/package.mjs` fixes both to
  the distribution identity independently of the display name in `plugin.json`.
