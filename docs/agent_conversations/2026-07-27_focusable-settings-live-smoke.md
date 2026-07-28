# Focusable settings live Steam Deck smoke

Date: 2026-07-27

Branch: `feat/focusable-settings-versions-panel`

Build: `0.1.0+6a8291a`

Device: `steamdeck`

## Installation and identity

- Backed up the previous plugin and settings under
  `/home/deck/Downloads/Decky-SteamAchievements-migration-backup-20260727`.
- Removed the old plugin through Decky Loader and installed the exact local package through
  Decky's supported `utilities/install_plugin` route.
- The installed directory and manifest are canonical:
  `/home/deck/homebrew/plugins/Decky-SteamAchievements` and
  `name: Decky-SteamAchievements`.
- Decky Loader registered the plugin as `Decky-SteamAchievements`, displayed
  `Achievements Restored` as its QAM panel title, and loaded version `0.1.0+6a8291a`.
- Preserved the prior settings while migrating them to
  `/home/deck/homebrew/settings/Decky-SteamAchievements/settings.json`.

## Plan smoke checks

1. **Independent gamepad focus:** Synthetic D-pad events through Steam's actual gamepad focus
   system visited the description, `Achievement bar`, `Debug logging`, `Plugin`, `Decky Loader`,
   and `SteamOS` rows in order. Each step had exactly one `gpfocus` element. Both settings were
   native checkbox controls and every version row was independently focusable.
2. **Runtime versions:** The panel showed plugin `0.1.0+6a8291a`, Decky Loader `v3.2.6`, and
   SteamOS `3.8.16`. These matched the installed `plugin.json`, the Decky settings About page
   (`Decky Version v3.2.6`), and the device's `/etc/os-release` respectively.
3. **Immediate disable and navigation:** With Hades open, activating `Achievement bar` by
   gamepad changed the control and persisted file to false and removed `ACHIEVEMENTS 12/49`
   without reloading Steam UI. Navigating to Brotato retained the absent row.
4. **Immediate re-enable:** Activating the same control on Brotato restored
   `ACHIEVEMENTS 79/179`. The DOM text contained one `ACHIEVEMENTS` token, not duplicates, and
   the rest of the game-details page remained rendered.
5. **Reload/restart persistence and no flash:** A saved-off plugin survived
   `DeckyPluginLoader.importPlugin` with zero mutation-observer appearances. It then survived
   Decky Loader's supported `updater/do_restart` service restart. During a second service
   restart, an external CDP sampler recorded 43 valid zero-row samples and 17 expected transient
   debugger-unavailable samples; it never observed an achievement row. After restart, the
   plugin was loaded at the expected version, the saved values remained false, and Steam UI was
   not blank. Re-enabling and returning to Brotato restored exactly one row.
6. **Diagnostics:** With debug logging enabled, a capture burst on a non-game route emitted the
   expected namespaced debug diagnostics. After disabling it, repeating disable/re-enable
   emitted ordinary namespaced info messages but no debug messages. The diagnostics setting
   survived plugin reload and both states persisted to disk.
7. **Race, failure, and dismount behavior:** Six rapid gamepad activations settled enabled both
   in the control and on disk, with one achievement row and no disabled/stuck control. A
   deliberately injected rejection for `set_feature_enabled` rolled the optimistic control back
   to enabled, left the saved setting enabled, emitted an ordinary warning while debug logging
   was off, and did not white-screen. Plugin unload/re-import exercised `onDismount`; the healthy
   plugin was reloaded afterward and Decky service restart remained clean.

## Final device state

- Decky Loader service is active.
- `Decky-SteamAchievements` is loaded at `0.1.0+6a8291a`.
- `feature_enabled` is `true`; `debug_logging` is `false`.
- Brotato shows exactly one restored achievement row.
- The QAM panel title text is `Achievements Restored`. The rendered title currently has no
  heading role or explicit ARIA label; changing those semantics would not require changing the
  canonical plugin identity.

## Display-name migration addendum

The user subsequently chose `Achievements Restored` for both Decky's plugin-list label and QAM
title. The exact build `0.1.0+59341a5` was packaged with a canonical
`Decky-SteamAchievements/` ZIP root and a `plugin.json` name of `Achievements Restored`.

- The former manifest identity was removed through Decky's supported uninstall confirmation and
  the new package was installed through `utilities/install_plugin` with its exact SHA-256.
- The only installed directory remained
  `/home/deck/homebrew/plugins/Decky-SteamAchievements`; the settings remained under
  `/home/deck/homebrew/settings/Decky-SteamAchievements` with `feature_enabled: true` and
  `debug_logging: false`.
- Decky Loader registered exactly one plugin named `Achievements Restored`, at version
  `0.1.0+59341a5`. The plugin-list button and opened-panel title both displayed that text, and the
  list contained no `Decky-SteamAchievements` display entry.
- Returning to Brotato showed exactly one restored achievement row and no blank layout. Decky
  Loader remained active.
