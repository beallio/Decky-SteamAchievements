# Focusable settings and versions panel review 02

Date: 2026-07-27

Branch: `feat/focusable-settings-versions-panel`

Reviewed commit: `93c20826bc50c664e37b941503dbbb5287cd12db`

Base branch: `dev` at `b7b307b`

Plans:

- `docs/plans/2026-07-26_focusable-settings-versions-panel.md`
- `docs/plans/2026-07-27_canonical-name-smoke-and-build-audit.md`

## Verdict

The implementation is clear to merge into `dev`. The full branch diff was reviewed against the
feature, identity, packaging, and release contracts. No blocking correctness, lifecycle,
identity, focus, installer, documentation, or integration findings remain.

## Prior finding resolution

1. Late settings responses cannot resurrect an unloaded patch. `SettingsCoordinator.dispose()`
   is terminal, clears listeners, and disposes the controller; both the coordinator and
   `AchievementFeatureController` reject post-disposal enable work. Automated tests exercise a
   late save response after disposal.
2. Feature and diagnostics writes are globally serialized. Each operation snapshots state when
   its queued task begins, applies backend responses in order, rolls back before the next queued
   task after failure, and keeps per-control busy state. Tests cover cross-toggle ordering and a
   failed first write followed by a successful second write.
3. Startup and panel rendering share one settings coordinator and exactly one backend settings
   load. Defaults, logger state, feature state, and subscribers therefore cannot diverge through
   independent initial requests.
4. Instance cleanup now preserves latest raw props for own data descriptors, commits them through
   own or inherited accessors, removes wrappers when there was no own descriptor, remains
   idempotent, and schedules the expected refresh. Focused tests cover each descriptor form.
5. Canonical product identity is used by manifests, plugin registration, documentation, backend
   logs, internal namespaces, installer paths, and package/release artifacts. The distinct QAM
   title is confined to `titleView` and explicit documentation of that exception. Automated
   identity and installer-bundle checks enforce this boundary.
6. The Desktop installer now has focused tests for stable release selection, canonical asset and
   manifest identity, rollback restoration, and privileged-plan rejection. Its tracked archive
   contains exactly the canonical launcher/helper paths and byte-matches its sources.

## Independent automated verification

The reviewer ran the complete feature-plan Quality Gates from a clean committed tree:

- `npm test`: 5 files and 68 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: production Rollup build passed.
- `python3 -m py_compile main.py`: passed.
- `uv run --with pytest -- pytest -q`: 12 tests passed.
- `scripts/orchestration/run-quality-gates`: passed source metadata, identity, installer bundle,
  typecheck, production build, frontend tests, Python compilation/tests, and version drift.
- `scripts/orchestration/check-review-notes-not-deleted`: passed.
- `git diff --check`: passed.
- `git status --short`: clean before this review note was created.

Additional packaging verification:

- `npm run package` produced `Decky-SteamAchievements.zip` at version `0.1.0+93c2082`.
- `python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip`: passed.
- `python3 scripts/check_installer_bundle.py`: passed.
- `python3 scripts/check_identity.py`: passed.

The npm invocations emitted only existing warnings about unsupported user-level npm configuration;
they did not affect command exit status or repository behavior.

## Live smoke evidence assessment

`docs/agent_conversations/2026-07-27_focusable-settings-live-smoke.md` records the exact installed
build `0.1.0+6a8291a`; commits after `6a8291a` add only the smoke record. The evidence covers all
seven device gates:

- real Steam gamepad focus visited the description, both settings, and all three version rows;
- displayed plugin, Decky Loader, and SteamOS versions matched their authoritative sources;
- disabling removed the current bar without a reload and remained disabled after navigation;
- re-enabling restored exactly one row without blanking the game-details layout;
- saved-off state survived plugin reload and Decky restarts with an external no-flash sampler;
- diagnostics persistence and verbose-versus-ordinary frontend output were observed;
- rapid activation, deliberate backend rejection, rollback, dismount/re-import, and service
  health were exercised without a stuck control or white screen.

Backend logger-level behavior and installer rollback failure paths are additionally covered by
automated tests; destructive installer rollback was appropriately not induced on the live Deck.

STATUS: APPROVED
