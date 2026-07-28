# Plan: Port SDH-ludusavi's Updates panel and self-updater (sdh-ludusavi-updates-panel)

## Context

Decky-SteamAchievements currently shows only **Settings** and **Versions** in its QAM panel.
It has release manifests and checksums for stable releases, but it has no update discovery,
update state, background polling, or Decky installer handoff. The requested outcome is to port
SDH-ludusavi's current **Updates** panel and supporting self-updater as close to 1:1 as the two
repositories' different identity, persistence, and release contracts permit.

This is a behavioral port, not a visual imitation. Copying only
`../SDH-ludusavi/src/components/PluginUpdateSection.tsx` would leave the panel without the
controller, persisted cache, integrity validation, installer handoff, or background checks that
make its controls truthful.

### Donor implementation reviewed

Use the current files in `../SDH-ludusavi` as the primary donor. Do not reconstruct their
behavior from this plan when the implementation can be copied and renamed directly.

| Concern | SDH-ludusavi source of truth | Behavior to preserve |
| --- | --- | --- |
| QAM rendering | `src/components/PluginUpdateSection.tsx` and the block near the end of `src/components/qam/LudusaviContent.tsx` | An **Updates** section immediately before **Versions**, with installed version, development-channel and automatic-check toggles, status/last-check time, candidate details, install/release-notes/check buttons, spinners, warnings, and downgrade confirmation. |
| Frontend state machine | `src/controllers/pluginUpdateController.tsx` and `pluginUpdateReducer.ts` | Hydrate pending installs, coalesce checks, enforce the 60-second UI timeout, distinguish manual/automatic checks, optimistically show an accepted install as current, revalidate before install, persist pending state before handoff, show the 3-second “Waiting for Decky...” state, and clear failed handoffs. |
| Decky handoff | `src/utils/deckyInstaller.ts` | Guard Decky's private API, support both `DeckyBackend.callable` and legacy `DeckyBackend.call`, pass the whole-ZIP SHA-256, and use install type 2 for update or 3 for downgrade. Never download or stage the ZIP in plugin-owned code. |
| Plugin-scope polling | `src/runtime/updatePoller.ts` and its construction/disposal in `src/index.tsx` | Start 30 seconds after plugin load, tick every 6 hours even when QAM is closed, always use unforced checks, suppress overlap/pending installs, toast once per new tag, and dispose all timers/late effects. The backend's 24-hour cache limits real GitHub requests. |
| RPC and types | `src/api/ludusaviRpc.ts` and updater types in `src/types/index.ts` | Keep the donor RPC names and result shapes so the component/controller can remain nearly unchanged. |
| Discovery and integrity | `py_modules/sdh_ludusavi/updater_client.py`, `updater_models.py`, `updater_discovery.py`, `updater_rate_limit.py`, and `updater.py` | Parse stable/dev/local versions, query GitHub Releases, lazily validate at most five manifests, validate identity/tag/channel/asset/hash, select stable/dev transitions, cache results for 24 hours, respect rate limits, and re-fetch/revalidate immediately before install. |
| Pending-install lifecycle | `py_modules/sdh_ludusavi/updater_pending.py`, updater service wiring, and startup reconciliation in `main.py` | Record request before calling Decky, confirm handoff, retain fresh pending state through Decky's reload window, promote it when the packaged version loads, and clear stale/mismatched state. |
| Release inputs | `scripts/package_plugin.py`, `.github/workflows/release.yml`, `.github/workflows/dev-release.yml`, and `scripts/request_dev_release.sh` | Every discoverable release has an immutable semver tag, exactly one ZIP, a checksum, and a schema-1 manifest. Stable and development releases are distinguished by manifest channel and GitHub prerelease state. |

### Current target state and reusable groundwork

- `src/index.tsx` owns one plugin-scoped `SettingsCoordinator`; `Content` owns the version
  snapshot and renders `<SettingsSection />` followed by `<VersionsSection />`. Insert the donor
  panel between those sections and keep the existing preferred-focus wrapper and description
  scroll behavior intact.
- `main.py` already persists `feature_enabled` and `debug_logging` atomically in
  `DECKY_PLUGIN_SETTINGS_DIR/settings.json` and resolves the installed version from packaged
  `plugin.json` before `package.json`. Extend this persistence without losing or resetting either
  existing setting.
- `scripts/package.mjs` already emits the exact schema-1 manifest and whole-ZIP checksum the
  donor updater consumes. Stable `.github/workflows/release.yml` already publishes the ZIP,
  checksum, and manifest, so do not replace the stable pipeline.
- The rolling `dev-build` prerelease deliberately has one ZIP and no manifest. It is mutable and
  must remain excluded from updater discovery. Preserve that quick-install channel, and add the
  donor's separate immutable `vX.Y.Z-dev.g<sha>` publication path for discoverable development
  updates.
- The repo is currently clean on `main`, but orchestration branches from the machine-local `dev`
  base configured by `orchestration.conf.local`.

### Required target-specific adaptations

These are the only intentional behavioral differences from the donor updater.

1. **Preserve split identity.** Discovery must require the Decky display name in manifest `pluginName` exactly
   `Achievements Restored`, `packageName` exactly `decky-steamachievements`, manifest asset name
   `Decky-SteamAchievements-<tag>.manifest.json`, and ZIP asset name exactly
   `Decky-SteamAchievements.zip`. The GitHub client targets
   `beallio/Decky-SteamAchievements`. Do not change any of those strings.
2. **Pass the display identity to Decky's installer.** The second
   `utilities/install_plugin` argument must be `Achievements Restored`, matching
   `plugin.json.name`. The checked-in Decky Loader implementation resolves installed folders by
   manifest name (`decky-loader/backend/decky_loader/browser.py::find_plugin_folder`); passing
   the archive/folder name would fail to find and uninstall the existing plugin. The ZIP root and
   installed folder nevertheless remain `Decky-SteamAchievements`.
3. **Use the target's small backend layout.** Put the copied pure updater modules under
   `backend/updater/` and package them through the existing recursive `backend/*.py` support in
   `scripts/package.mjs`. Do not import Ludusavi's service, game lifecycle, notifications store,
   or other product-specific infrastructure.
4. **Keep target settings ownership.** Add `update_channel` (default `stable`) and
   `automatic_update_checks` (default `true`) to the existing settings file. Keep updater cache
   and pending-install bookkeeping in a separate atomic runtime-state file under
   `DECKY_PLUGIN_RUNTIME_DIR`, protected by a cross-process lock so Decky's reload sequence
   cannot resurrect stale state.
5. **Use the existing automatic-check toggle as the notification control.** This project has no
   general notification settings panel. When automatic checks are enabled, the plugin-scope
   poller may emit the donor's once-per-tag update toast; disabling automatic checks disables
   both polling and those toasts. Manual checks remain available either way. Do not add an
   unrelated Notifications section just to copy SDH-ludusavi's global notification switch.
6. **Preserve target gamepad behavior.** Add `highlightOnFocus` and explicit focusability where
   required by this repo's conventions, but do not otherwise redesign the donor section. Every
   toggle, installed/status field, and button must remain reachable with the D-pad, and the
   existing description remains the preferred first focus target.

### Protected invariants

- Do not touch achievement capture/patch behavior in `src/achievementBar.tsx`,
  `src/featureController.ts`, or their tests except for imports forced by an independently moved
  shared type (avoid such moves).
- Never fabricate an update candidate, trust a GitHub ZIP without its validated release
  manifest, log a complete SHA-256/download URL, or let a failed updater crash the Steam UI.
- Never overwrite the running plugin from Python or frontend code. Installation ends at Decky's
  native confirmation prompt and supported installer RPC.
- Keep the stable release asset, archive root, installed directory, settings/runtime/log
  namespaces, desktop installer, and npm package identities unchanged.
- Do not dispatch a workflow, create/push a tag, publish a release, deploy to a Deck, or alter
  `orchestration.conf.local` during implementation. Those are deferred human/on-device actions.

**Slug used throughout this plan:** `sdh-ludusavi-updates-panel`

---

## Orchestration Contract

**Slug:** `sdh-ludusavi-updates-panel`

**Plan file:**

```text
docs/plans/2026-07-27_sdh-ludusavi-updates-panel.md
```

**Implementation branch:**

```text
feat/sdh-ludusavi-updates-panel
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finalized
```

**Review notes:**

```text
docs/review/sdh-ludusavi-updates-panel-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/sdh-ludusavi-updates-panel
```

Commit this plan first:

```bash
git add docs/plans/2026-07-27_sdh-ludusavi-updates-panel.md
git commit -m "docs(plan): add sdh-ludusavi-updates-panel implementation plan"
```

---

## Implementation Tasks

Work in order. For each behavior-changing task, first add the focused failing test, run it and
capture the expected failure, implement the minimum port, then run the focused test green before
continuing. Prefer copying donor code and tests with narrow identity/path adaptations over
rewriting the algorithms.

### Task 1 — Port the pure updater model, discovery, and integrity engine

Create a package under `backend/updater/` by copying and adapting these donor modules:

- `updater_models.py` → `backend/updater/models.py`
- `updater_client.py` → `backend/updater/client.py`
- `updater_discovery.py` → `backend/updater/discovery.py`
- `updater_pending.py` → `backend/updater/pending.py`
- `updater_rate_limit.py` → `backend/updater/rate_limit.py`
- `updater.py` → `backend/updater/service.py`

Keep the donor version grammar and comparison semantics: stable `X.Y.Z`, immutable development
`X.Y.Z-dev.<id>`, optional local `+<build>` metadata, stable-to-dev upgrades, dev-to-stable moves,
and explicit downgrade-to-stable actions. Preserve the five-manifest attempt cap, 24-hour
successful-result cache, rate-limit cooldown, lazy manifest fetching, SHA/URL/version
revalidation, pending-install grace rules, and privacy-preserving log formatting.

Adapt only the constants listed in Context: repository owner/name, manifest filename prefix,
display/plugin identity, npm package identity, and fixed ZIP asset. The HTTP client must remain
stdlib-only, use a bounded timeout and verified TLS, and return structured failures instead of
raising network errors through the QAM.

Port the relevant donor tests into focused target files such as:

- `tests/test_updater_models.py`
- `tests/test_updater_discovery.py`
- `tests/test_updater_service.py`
- `tests/test_updater_client.py`

Cover version parsing/ordering, malformed payloads, strict manifest and asset uniqueness,
stable/development selection, local build metadata, cache hits, retry headers, five-attempt lazy
validation, revalidation mismatch failure, pending TTL/reconcile helpers, and the prohibition on
logging full hashes or artifact URLs. Use fake release clients; unit tests must not access the
network.

### Task 2 — Add durable updater state and backend RPC lifecycle

Extend `main.py` and add the smallest backend support modules needed to host the copied updater.
The design must preserve the donor's concurrency and reload guarantees without importing its
Ludusavi service graph:

1. Extend `DEFAULT_SETTINGS`, normalization, typing, and setters with `update_channel` and
   `automatic_update_checks`. Invalid channels normalize to `stable`; non-boolean automatic
   values normalize to `true`. Existing two-key files migrate in memory and are written with the
   new defaults only on the next mutation; never reset `feature_enabled` or `debug_logging`.
2. Add an atomic updater runtime-state store under `DECKY_PLUGIN_RUNTIME_DIR` for
   `update_check_cache`. Use temp-file + `os.replace` writes and a bounded `fcntl.flock` lock for
   compound read/adopt/reconcile/write. Maintain the lock ordering consistently. Malformed or
   missing state must fail closed to an empty cache, not prevent plugin startup.
3. Construct the updater with the packaged-manifest version resolver, GitHub client, UTC clock,
   monotonic clock, shared state lock, save callback, and a log adapter that maps donor levels to
   `decky.logger` without full secrets.
4. Add backend RPC methods with the donor names and payloads:
   `set_update_channel`, `set_automatic_update_checks`, `get_update_check_context`,
   `check_for_plugin_update`, `revalidate_plugin_update`,
   `record_update_install_requested`, `confirm_update_install_handoff`,
   `clear_pending_update_install`, and `mark_update_notified`. Add a narrow frontend-log RPC if
   required to preserve donor updater diagnostics.
5. Offload blocking GitHub/update operations from Decky's async event loop through a shared
   daemon-worker executor, following SDH-ludusavi's `rpc_pool.py` and `_run_blocking` pattern.
   `_unload` must cancel queued work and shut the executor without waiting for in-flight network
   calls. Expected updater errors return `{status: "failed", message: ...}`; cancellation and
   process-exit exceptions are not swallowed.
6. During `_main`, initialize state and reconcile a pending install against the version from the
   newly loaded packaged manifest. A fresh mismatched pending record survives only the donor's
   grace window; a matching loaded version promotes installed release metadata and clears stale
   check/notified cache. Re-read state under the inter-process lock before reconciling so two
   reload instances cannot double-promote or resurrect it.

Extend `tests/test_main.py` and add focused persistence/executor tests. Demonstrate migration of
old settings, invalid-value normalization, separate cache persistence, atomic cleanup of temp
files, cross-holder exclusion, non-blocking RPC dispatch, structured failure, startup promotion,
fresh mismatch retention, stale mismatch clearing, no double promotion, and executor shutdown.

### Task 3 — Port frontend updater contracts, reducer, controller, and Decky adapter

Add the donor update types and callable declarations to `src/backend.ts`, keeping this repo's
existing settings/version exports stable. Create the donor-equivalent files:

- `src/controllers/pluginUpdateReducer.ts`
- `src/controllers/pluginUpdateController.tsx`
- `src/utils/deckyInstaller.ts`

Copy the donor state transitions and effects rather than simplifying them. Preserve hydration,
check coalescing, the 60-second timeout, cached vs forced checks, stale-candidate coercion,
optimistic `installedOverride`, pending-install suppression, install-time revalidation, pending
record-before-handoff ordering, the 3-second installer race, success confirmation, failure clear,
and disposal of late timeout effects.

Adapt controller logging to the target backend/logging surface and change the user-facing QAM toast
identity to **Achievements Restored**. In `deckyInstaller.ts`, pass **Achievements Restored** to
both supported `utilities/install_plugin` call forms; retain update type `2`, downgrade type `3`,
and the validated whole-ZIP hash.

Port and strengthen the donor frontend tests:

- reducer transitions for hydration, checking, current/available, timeout, handoff pending,
  success/failure, and clearing the installed override;
- controller ordering and failure behavior, no forced hydration feedback loop, stale candidate
  suppression, timeout cleanup, post-install optimistic state, late handoff resolution/rejection,
  and unmount cleanup;
- installer availability plus callable/call paths, exact display-name argument, version/hash, and
  update/downgrade enum values.

Use fake timers and mocked RPCs; no test may open a real Decky prompt or network request.

### Task 4 — Copy the Updates section and integrate it into the QAM panel

Copy `../SDH-ludusavi/src/components/PluginUpdateSection.tsx` to
`src/components/PluginUpdateSection.tsx` with only import/type, identity, and focus adaptations.
Keep the donor labels and ordering:

1. Installed Version, including `(Local Build)` for `+` metadata;
2. Receive development releases, with the development-risk confirmation modal;
3. Automatically check for updates;
4. Status and localized last-checked time;
5. error/candidate detail rows when applicable;
6. install or downgrade action, View Release Notes, and Check now.

Keep the donor status text and spinners, including `Never checked`, `Checking...`, `Up to date`,
`Update available`, `Latest available development build`, `Preparing...`, and
`Waiting for Decky...`. Keep the downgrade/data-loss confirmation and manual-install fallback
when Decky's private installer API is unavailable.

Extend `SettingsCoordinator` rather than creating a second settings owner. Add queued,
optimistic, rollback-safe update-channel and automatic-check mutations with independent busy
flags, preserving the current cross-setting serialization and terminal disposal behavior. Wire
the new RPC setters through `src/index.tsx`.

In `Content`:

- retain the existing single version fetch;
- add `confirmInstalledPluginVersion(version)` to update `versions.plugin` optimistically after
  accepted handoff, like SDH-ludusavi's `LudusaviContent`;
- render `<PluginUpdateSection />` after `<SettingsSection />` and immediately before
  `<VersionsSection />`;
- disable update toggles until settings are loaded or while their own mutation is busy;
- leave the description row as preferred first focus and preserve the QAM scroll-reset logic.

Extend `src/components/panel.test.tsx` (or add a focused component test) and
`src/settingsCoordinator.test.ts`. Assert the exact section/row/button ordering and copy,
candidate/error branches, modal decisions, independently focusable/highlighted fields and
toggles, queued update-setting writes, stale-response protection, rollback, and no mutation after
dispose. Do not weaken the existing settings, versions, description, or focus tests.

### Task 5 — Port plugin-scope background polling and deduplicated toast behavior

Copy `src/runtime/updatePoller.ts` and its fake-timer tests from SDH-ludusavi. Construct one poller
in the `definePlugin` callback, outside `Content`, after starting the settings coordinator. Wire
it to update-context/check/mark-notified RPCs, `@decky/api` toaster, and the target logger. Start
it once at plugin load and dispose it before coordinator teardown in `onDismount`.

Keep the 30-second initial delay and 6-hour interval constants. Each tick must:

- skip when disposed, already in flight, automatic checks are disabled, or an install is pending;
- pass `effective_installed_version` and `force=false` to the backend;
- log and continue after RPC failures;
- show the Decky QAM toast **Achievements Restored Update Available** once for a new candidate tag and persist
  `last_notified_tag` only after issuing the toast;
- suppress all late notification/marking side effects after disposal.

Port all donor poller tests, including initial delay, recurring schedule, never-force behavior,
disabled/pending skips, tag deduplication, overlap suppression, error recovery, and disposal of
initial/interval/late work.

### Task 6 — Make development releases discoverable without removing `dev-build`

Stable release publication already produces compatible artifacts. Keep it intact and add tests
that lock its updater contract: exact ZIP/manifest/checksum names, schema/identity/channel fields,
tag-to-version agreement, and one ZIP asset.

Adapt SDH-ludusavi's immutable development-release flow into this repository while retaining the
existing push-triggered rolling prerelease:

1. Keep `dev-build` mutable, push-triggered, prerelease-only, and exactly one
   `Decky-SteamAchievements.zip` asset. It remains intentionally undiscoverable because it has no
   semver tag or manifest.
2. Stamp rolling packages as `<base>-dev.g<shortsha>` instead of the bare base version so the
   installed panel truthfully reports a development build. Continue publishing no manifest from
   this rolling job.
3. Add an explicit/manual workflow-dispatch path (a separate conditional job or a clearly named
   workflow) adapted from SDH-ludusavi. It accepts a stable `base_version` and optional commit,
   resolves immutable version/tag `X.Y.Z-dev.g<shortsha>` / `vX.Y.Z-dev.g<shortsha>`, verifies the
   base matches committed metadata and is ahead of the highest stable tag, refuses an existing
   tag, runs full gates, packages with `--emit-release-metadata`, validates the checksum/ZIP, and
   publishes exactly the ZIP, checksum, and manifest as a permanent prerelease.
4. Add `scripts/request_dev_release.sh` as a validation/thin-dispatch helper matching the donor's
   CLI, but do not invoke it during implementation. It must fail before dispatch when the tree,
   version, ref, or GitHub authentication is unsuitable.
5. Add static/workflow tests (for example `tests/test_release_workflows.py`) that distinguish the
   rolling and immutable jobs, reject manifest publication under `dev-build`, require all three
   immutable assets, and prove stable release matching ignores `-dev` tags.

Do not change stable tag immutability, stable ancestry/changelog gates, the fixed ZIP name, or
the human `dev` → `main` stable-release gate.

### Task 7 — Update contracts, user docs, and durable implementation evidence

Update the documentation only after behavior and tests are green:

- `README.md`: add the donor-equivalent **In-Plugin Updates** behavior—stable/development
  channels, manual/automatic checks, once-per-release toast, integrity validation, Decky handoff,
  and manual/desktop-installer fallback.
- `DEVELOPER.md` and `docs/runbooks/release.md`: document the rolling-vs-immutable development
  distinction, the manual dev dispatch helper, the three discoverable release assets, and that
  implementation itself does not authorize dispatch/publication.
- `AGENTS.md`: record the updater module locations, manifest/identity invariants, Decky installer
  display-name argument, settings defaults, pending-install cleanup/reconciliation, and both dev
  release paths. Preserve the distribution/display split verbatim.
- Add `docs/agent_conversations/2026-07-27_sdh-ludusavi-updates-panel.md` with donor files
  reviewed, files changed, RED/GREEN evidence, identity decisions, tests/gates, and deferred
  on-device/release verification.

Run `git diff --check` and the full quality gates before committing the documentation/session
record. Do not include generated ZIP, checksum, manifest, cache, or `/tmp` artifacts in commits.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

### Automated verification

Run focused tests during RED/GREEN work, then run this final sequence from the repository root:

```bash
npx tsc --noEmit
npm run build
npm test
uv run --with pytest -- pytest -q
python3 -m py_compile main.py backend/updater/*.py
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git diff --check
git status --short
```

The final implementation must additionally demonstrate, through tests or deterministic local
fixtures:

1. An old two-key `settings.json` loads with stable/automatic updater defaults without losing
   either old value.
2. A valid stable release and valid immutable development prerelease are discovered; draft,
   wrong-identity, wrong-channel, duplicate-ZIP, bad-hash, mutable `dev-build`, and malformed
   releases are rejected.
3. Revalidation catches changed hash, artifact URL, version, or manifest before Decky is called.
4. The installer call receives the Decky display name `Achievements Restored`, the exact candidate version and SHA-256,
   and type 2/3 as appropriate.
5. Recording pending state happens before installer handoff; rejection clears it; success and
   reload produce optimistic then reconciled current-version state.
6. The QAM tree orders Description → Settings → Updates → Versions and all existing preferred
   focus/scroll assertions still pass.
7. The plugin-scope poller continues without a mounted QAM, never forces a check, deduplicates
   tags, suppresses overlap, and has no effects after dismount.
8. The stable, rolling-dev, and immutable-dev workflow tests enforce their three distinct asset
   contracts.

### Local release-fixture verification

Without publishing or changing refs, build a stable fixture for the current committed base
version using `scripts/package.mjs --emit-release-metadata`. Verify the generated manifest fields
and checksum against the ZIP, validate the ZIP with `scripts/validate_plugin_zip.py`, and remove
the generated root artifacts after capturing results under `/tmp/Decky-SteamAchievements/`.
Repeat with an `X.Y.Z-dev.g<fixture>` version and `channel=dev`; do not create a Git tag or GitHub
Release.

### Deferred on-device verification

The following require a Steam Deck and at least one published release newer/different than the
installed fixture. They are explicitly deferred until the user authorizes deployment and release
actions:

1. Install a build through Decky's supported ZIP flow and open the plugin in QAM. Confirm the
   Updates panel appears between Settings and Versions, begins focus at the description, and
   every new field/toggle/button is D-pad reachable without trapping focus or hiding the title.
2. Check on stable while current, then against a known newer stable release. Confirm status,
   last-checked time, candidate version, release-notes navigation, and action copy.
3. Enable development releases through the warning modal and confirm an immutable
   `vX.Y.Z-dev.g<sha>` prerelease is selected while `dev-build` is ignored. Switch back to stable
   and verify move-to-stable or downgrade confirmation as appropriate.
4. Accept Decky's install prompt and confirm it updates the existing
   `/home/deck/homebrew/plugins/Decky-SteamAchievements` directory rather than creating a second
   plugin. Observe `Preparing...`/`Waiting for Decky...`, reload, installed version, and pending
   reconciliation. Repeat once by cancelling/failing the prompt and confirm the candidate becomes
   actionable again.
5. With automatic checks enabled and the QAM closed, leave the plugin loaded past the 30-second
   initial delay. Confirm one update toast for a new tag and no repeated toast across later
   reloads/checks. Confirm disabling automatic checks suppresses the background check/toast while
   Check now still works.
6. Capture Decky/backend/frontend logs and verify failures no-op instead of crashing Steam UI and
   no complete SHA-256 or artifact URL is logged.

Do not mark any deferred item complete from unit tests alone. Record actual device build, Decky
version, installed/candidate versions, release tag, and observations when the smoke test is later
run.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished sdh-ludusavi-updates-panel
```

This writes:

```text
/tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer sdh-ludusavi-updates-panel`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/sdh-ludusavi-updates-panel-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished sdh-ludusavi-updates-panel
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/sdh-ludusavi-updates-panel-review-*.md
   git commit -m "docs(review): record sdh-ludusavi-updates-panel review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished sdh-ludusavi-updates-panel
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer sdh-ludusavi-updates-panel` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed sdh-ludusavi-updates-panel
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize sdh-ludusavi-updates-panel
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize sdh-ludusavi-updates-panel
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finished
/tmp/Decky-SteamAchievements/sdh-ludusavi-updates-panel_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
