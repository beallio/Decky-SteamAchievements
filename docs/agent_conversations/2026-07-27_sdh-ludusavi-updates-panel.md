# SDH-ludusavi Updates panel implementation — 2026-07-27

## Scope

Implemented the existing
`docs/plans/2026-07-27_sdh-ludusavi-updates-panel.md` contract on
`feat/sdh-ludusavi-updates-panel`. The work is a behavioral port of the donor
updater, adapted only for this repository's identity, persistence, QAM focus,
and release contracts. Achievement capture and patch behavior were not changed.

## Donor implementation reviewed

- `py_modules/sdh_ludusavi/updater_models.py`,
  `updater_client.py`, `updater_discovery.py`, `updater_pending.py`,
  `updater_rate_limit.py`, and `updater.py`
- `py_modules/sdh_ludusavi/persistence.py` and `rpc_pool.py`
- `src/controllers/pluginUpdateReducer.ts` and
  `pluginUpdateController.tsx`
- `src/components/PluginUpdateSection.tsx` and the updater integration in
  `src/components/qam/LudusaviContent.tsx`
- `src/utils/deckyInstaller.ts` and `src/runtime/updatePoller.ts`
- donor updater, controller, poller, release-workflow, and RPC-pool tests
- `.github/workflows/dev-release.yml` and
  `scripts/request_dev_release.sh`

## Implementation summary

- Added the stdlib-only updater engine under `backend/updater/`, including
  semver/dev/local parsing, strict release/manifest discovery, lazy validation,
  24-hour cache behavior, rate-limit cooldown, install-time revalidation, and
  pending-install reconciliation.
- Extended `main.py` with stable/automatic updater settings, a separate
  `DECKY_PLUGIN_RUNTIME_DIR/updater-state.json` store, bounded flock locking,
  daemon-worker RPC offload, all updater RPCs, and startup reconciliation.
- Added the frontend updater types, reducer/controller, Decky installer adapter,
  Updates section, shared settings mutations, optimistic installed-version
  state, and plugin-scope background poller.
- Preserved QAM order as Description, Settings, Updates, Versions, with the
  description still preferred focus and every updater field, toggle, and button
  gamepad reachable.
- Preserved the distribution name `Decky-SteamAchievements` and npm name
  `decky-steamachievements`; release manifests and the Decky installer use the
  required Decky display identity from `plugin.json`.
- Kept `dev-build` mutable and ZIP-only, stamped it as
  `X.Y.Z-dev.g<sha>`, and added a separate manually dispatched immutable dev
  workflow for `vX.Y.Z-dev.g<sha>` ZIP/checksum/manifest releases.

## RED/GREEN evidence

- Baseline quality gate was red before source changes because four sentences in
  the committed plan lacked explicit Decky display/QAM context. Task 7 corrected
  those wording-only identity-gate violations.
- Task 1 RED: `ModuleNotFoundError: No module named 'backend'`.
  GREEN: 45 focused updater-engine tests.
- Task 2 RED: missing runtime-state module and updater lifecycle.
  GREEN: 61 backend/updater tests, including settings migration, atomic state,
  flock exclusion, offloaded failures, reconciliation, and shutdown.
- Task 3 RED: missing controller and Decky installer modules.
  GREEN: TypeScript plus 16 reducer/controller/installer/settings-contract tests.
- Task 4 RED: missing Updates component and updater settings mutations.
  GREEN: TypeScript plus 26 QAM/controller/coordinator tests and a Rollup build.
- Task 5 RED: missing plugin-scope update poller.
  GREEN: all 12 donor fake-timer poller tests.
- Task 6 RED: rolling version stamping, immutable workflow, and request helper
  absent. GREEN: release-contract tests and shell syntax validation.
- Final integration RED: the console-script pytest command did not add the
  repository root to `sys.path`, so `backend` imports failed at collection.
  Added `pytest.ini` with `pythonpath = .`; the plan's exact pytest invocation
  then collected the complete backend suite.
- Release-fixture RED: the existing ZIP validator still treated every
  `backend/` path as forbidden even though packaging now recursively includes
  the planned updater package. Added a validator regression fence that permits
  only Python sources below `backend/` and still rejects compiled or unrelated
  payloads.
- Final contract audit added regression fences for rejecting releases with an
  extra ZIP and for keeping the disabled candidate action visible as
  `Waiting for Decky...` during a slow installer handoff.

Detailed command output is retained under
`/tmp/Decky-SteamAchievements/task*-*.log`.

Stable `0.1.1` and development `0.1.1-dev.gfixture` package fixtures both
passed checksum, manifest-field, and ZIP validation. Their artifacts and the
root-ZIP restoration checksum are retained at
`/tmp/Decky-SteamAchievements/release-fixtures.qStzPM/`.

## Identity and integrity decisions

- Discovery accepts exactly one `Decky-SteamAchievements.zip` and exactly one
  `Decky-SteamAchievements-<tag>.manifest.json`.
- The schema-1 manifest must match the Decky display name in `plugin.json`,
  npm package name, tag, channel, version, asset name, and whole-ZIP SHA-256.
- Decky's `utilities/install_plugin` receives the manifest display identity,
  exact validated version/hash, and install type 2 or downgrade type 3.
- Full hashes and artifact URLs are not emitted to updater logs.
- Python/frontend code ends at Decky's supported installer confirmation; it
  never downloads, stages, or overwrites the running plugin.

## Deferred verification

No workflow was dispatched, tag created or pushed, release published, Deck
deployment performed, or `orchestration.conf.local` changed. The plan's six
on-device checks remain explicitly deferred: QAM focus/layout, stable and dev
discovery against published fixtures, in-place Decky install/cancel behavior,
background toast behavior with QAM closed, and live log privacy/failure
observations. Record the Steam/Decky versions, installed/candidate versions,
tag, and observations when those checks are authorized and run.

## Review round 01

- Added one shared bounded inter-process lock around every settings
  read-modify-write. RED reproduced the lost-update race with two independent
  plugin holders; GREEN proves a feature toggle and updater-channel mutation
  both survive the forced overlap.
- Hardened `scripts/request_dev_release.sh` to fail closed on the complete
  porcelain worktree status, refresh `origin` branches and tags, and require the
  selected commit to be contained by a refreshed remote branch before dispatch.
  Executable temporary-repository tests went RED for an untracked file and a
  clean local-only commit, then GREEN after the preflight changes.
- Promoted `docs/deep-patch-notes.md` as the tracked authoritative achievement
  handoff, added the confirmed guard/runtime summary, and replaced active links
  to the deleted root handoff. The orchestrator-authored review note remains
  unchanged as the audit record.
