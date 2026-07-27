# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release entries are curated by hand and dated. A release must not be cut against an
`[Unreleased]` heading — roll it over to the version being released first.

## [Unreleased]

### Added

- Canonical plugin identity pinned to `Decky-SteamAchievements` (the repository name) in
  `plugin.json` and `package.json`, with `Achievements Restored` retained as the user-facing
  display name in the QAM. The contract is documented in `AGENTS.md`.

### Changed

- On-device install directory is now `~/homebrew/plugins/Decky-SteamAchievements/`, and the
  packaged release asset is `Decky-SteamAchievements.zip`. Both are derived from `plugin.json`
  `name` by `scripts/package.mjs`.

## [0.1.0] - Unreleased

Initial development version. Restores the achievement progress bar Valve removed from the Steam
Deck game-details PlayBar by supplying the `onSeek` prop its `MiniAchievements` component
requires, via a prototype-method patch that avoids remounting Steam's content components.

No release has been tagged yet; the repository has no tags and no published GitHub release.
