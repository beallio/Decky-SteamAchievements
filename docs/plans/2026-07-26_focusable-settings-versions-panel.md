# Plan: Add focusable settings and versions panel (focusable-settings-versions-panel)

## Context

`Achievements Restored` currently installs the achievement restoration patch immediately and
shows only a static status message in its Quick Access Menu panel. It has no persistent settings,
no runtime feature switch, and no version display. The backend is a minimal lifecycle shell.

This change adds:

1. a persistent toggle controlling whether the achievement bar restoration is active;
2. a persistent toggle controlling verbose frontend/backend diagnostics;
3. a `Versions` section listing the packaged plugin version, Decky Loader version, and SteamOS
   version; and
4. explicit gamepad focus behavior for every setting and every displayed version row.

Local API/source inspection established the implementation contracts:

- `ToggleField` is Decky's standard focusable settings control.
- `Field` supports `focusable={true}` and `highlightOnFocus={true}`, which is appropriate for
  read-only version rows.
- A root `Focusable` group gives the panel a stable gamepad navigation boundary.
- Decky Loader exposes its backend version as `decky.DECKY_VERSION` (with `DECKY_VERSION` as a
  fallback environment variable).
- SteamOS exposes its displayable OS version as `VERSION_ID` in `/etc/os-release`.
- The packaged plugin version must be read from the installed `plugin.json` (fall back to
  `package.json`) so local `+githash` builds display the actual installed version.

The feature toggle has one additional runtime requirement. The current disposer unpatches the
route/prototype but leaves already-restored `MiniAchievements` instances with their persistent
`props` getter. A real disable switch must undo those instance restorations and force the current
page to render without the bar. Re-enabling must then install a fresh patch cleanly.

### Intended user-facing layout

```text
Settings
  Achievement bar                 [on/off]
  Debug logging                   [on/off]

Versions
  Plugin                          <version>
  Decky Loader                    <version>
  SteamOS                         <version>
```

Use short factual descriptions. The second toggle's visible label is exactly `Debug logging`;
its description may say that it enables verbose troubleshooting output. Do not expose internal
log-level implementation details in the panel copy.

### Defaults

- Achievement bar: enabled.
- Debug logging: disabled.
- Missing/unreadable version value: `Unknown`.

### Non-goals

- No updater, log viewer, restart button, or release-channel UI.
- No new achievement rendering or alternate placement.
- No change to the capture signatures, route lifecycle, or bounded retry schedule except what
  is necessary to make instance restoration reversible.
- No hashed Steam classname or minified-symbol dependencies.

---

## Orchestration Contract

**Slug:**

```text
focusable-settings-versions-panel
```

**Plan file:**

```text
docs/plans/2026-07-26_focusable-settings-versions-panel.md
```

**Base branch:**

```text
dev
```

**Implementation branch:**

```text
feat/focusable-settings-versions-panel
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finalized
```

**Review-note glob:**

```text
docs/review/focusable-settings-versions-panel-review-*.md
```

Review notes end with exactly one trailer:

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
5. Follow TDD for backend parsing/persistence, runtime enable/disable behavior, logging, and UI
   focus contracts.
6. Run every quality gate before marking a round complete.
7. Do not write your own review or create/delete files under `docs/review/`.
8. Commit orchestrator-authored review notes as durable audit records when resolving them.
9. Stop polling after successful finalization.

---

## Scope discipline

Expected implementation scope:

- `main.py`
- `src/achievementBar.tsx`
- `src/achievementBar.test.tsx`
- `src/backend.ts` (new)
- `src/log.ts`
- `src/index.tsx`
- `src/components/SettingsSection.tsx` (new)
- `src/components/VersionsSection.tsx` (new)
- focused frontend tests for the controller/log/UI contracts
- `tests/test_main.py` (new backend tests)
- `package.json` / `package-lock.json` only if a small React test renderer is required
- `AGENTS.md` only for durable setting/version/runtime facts

Do not modify packaging/release scripts, manifests, achievement data lookup, or unrelated docs.
Keep Steam/Decky failures fail-closed and preserve unrelated worktree state.

---

## Setup

Start from the integrated local development branch:

```bash
git checkout dev
git checkout -b feat/focusable-settings-versions-panel
```

Commit this plan first:

```bash
git add docs/plans/2026-07-26_focusable-settings-versions-panel.md
git commit -m "docs(plan): add focusable-settings-versions-panel plan"
```

---

## Implementation Tasks

### 1. Add a small persistent backend settings contract

Extend `main.py` with a narrow JSON settings store under
`decky.DECKY_PLUGIN_SETTINGS_DIR`, for example `settings.json`.

Normalized schema:

```json
{
  "feature_enabled": true,
  "debug_logging": false
}
```

Requirements:

- Missing file, missing keys, invalid JSON, or wrong value types resolve to the documented
  defaults without crashing plugin startup.
- Boolean values are normalized strictly; do not treat arbitrary non-empty strings as true.
- Writes create the settings directory and replace the file atomically (temporary sibling plus
  `os.replace`) so an interrupted write cannot leave partial JSON.
- Protect read-modify-write operations with a small lock.
- Applying `debug_logging` updates `decky.logger` to `logging.DEBUG` when enabled and
  `logging.INFO` when disabled.
- `_main()` loads settings and applies the backend log level before its normal startup message.

Expose explicit async RPC methods:

```text
get_settings() -> {feature_enabled: bool, debug_logging: bool}
set_feature_enabled(enabled: bool) -> normalized settings
set_debug_logging(enabled: bool) -> normalized settings
```

Each setter persists the requested value and returns the whole normalized settings payload so
the frontend can reconcile optimistic state. Keep failures logged and surfaced to the caller;
do not silently report an unsaved value as successful.

### 2. Add backend version discovery

Add pure/testable helpers in `main.py` and expose:

```text
get_versions() -> {plugin: str, decky: str, steamos: str}
```

Resolution rules:

- **Plugin:** locate the directory containing `main.py`; read `plugin.json` first and
  `package.json` second; return the first non-empty string `version`.
- **Decky Loader:** prefer a real non-empty string from `decky.DECKY_VERSION`; fall back to the
  `DECKY_VERSION` environment variable.
- **SteamOS:** parse `VERSION_ID` from `/etc/os-release`, accepting quoted or unquoted values.
- Return an empty string internally when unavailable; the frontend owns the `Unknown`
  presentation fallback.
- Never hardcode current device versions.

### 3. Add Python tests before backend implementation

Create `tests/test_main.py`. Stub the injected `decky` module before importing `main.py` and use
temporary directories/files. Cover at minimum:

- defaults when the settings file is absent;
- normalization/recovery from malformed JSON and invalid value types;
- setting each preference preserves the other key and writes valid JSON;
- atomic replacement leaves the final file at the expected path;
- backend log level follows the saved debug setting;
- quoted/unquoted/missing `VERSION_ID` parsing;
- Decky module constant and environment fallback precedence;
- installed manifest version precedence and package fallback;
- `get_versions()` returns all three keys and does not throw when sources are unavailable.

The tests must not read or write the host's real `/etc/os-release` or Decky settings directory.

### 4. Add typed frontend backend bindings

Create `src/backend.ts` using `callable` from `@decky/api`:

```ts
type PluginSettings = {
  feature_enabled: boolean;
  debug_logging: boolean;
};

type Versions = {
  plugin: string;
  decky: string;
  steamos: string;
};
```

Export typed bindings for `get_settings`, both setters, and `get_versions`. Keep route names
identical to the Python method names.

### 5. Make achievement restoration fully reversible

Refactor instance restoration in `src/achievementBar.tsx` so the disposer returned by
`installAchievementBarPatch()` removes the visible feature from the currently mounted page,
not merely future renders.

Required behavior:

- When patching an instance, retain its original configurable own `props` descriptor and the
  latest raw Valve props separately from the injected props view.
- The installed setter records each new raw props value, then derives the view containing the
  synthetic `onSeek`. Do not lose later Valve prop updates.
- Produce an idempotent per-instance cleanup operation that restores a normal raw `props`
  property/descriptor, removes `__achRestored`, and schedules one out-of-band `forceUpdate()`.
- Track every mounted instance restored from both initial capture and future prototype renders.
- On plugin/feature disposal: stop route/capture/prototype hooks first, then clean every tracked
  instance independently. One malformed/detached instance must not block the others.
- Re-enabling after disposal must be able to restore those same or replacement instances again.
- Preserve an existing non-null native `onSeek` exactly as today.

Extend `patchMiniAchievementsRender()` with a small callback/registry seam if needed so future
instances can register their cleanup with the owning installation. Avoid module-global mutable
registries that could mix separate install cycles.

Add tests proving:

- cleanup removes only the injected handler and preserves the latest raw props;
- cleanup schedules the hide re-render once and is idempotent;
- the installation disposer cleans both initially captured and later-rendered instances;
- enable → disable → enable installs two clean patch lifecycles without duplicate getters,
  timers, or prototype patches;
- cleanup failures remain fail-closed.

### 6. Add a testable feature lifecycle controller

Do not let React effects directly duplicate patch-install bookkeeping. Add a small controller
(in `src/index.tsx` or a focused module) with this contract:

```text
setEnabled(true)  -> install once if currently disabled
setEnabled(false) -> invoke disposer once and clear it
dispose()         -> disable idempotently
```

Inject `installAchievementBarPatch` in tests. Cover repeated same-value calls, disable/re-enable,
installer failure, disposer failure, and final disposal.

The controller starts disabled. The initial persisted settings load decides whether to install,
which prevents a saved-off plugin from briefly restoring the bar during startup. If settings
loading fails, apply the documented defaults (feature enabled, diagnostics disabled) and log the
failure.

### 7. Expand the frontend logger contract

Keep `setVerboseLogging(enabled)` as the single runtime switch. When disabled, both fine-grained
frontend diagnostic methods are no-ops; when enabled, they delegate to their corresponding
console methods with the existing namespace prefix. `info`, `warn`, and `error` retain their
current behavior.

Add `trace(scope, ...args)` alongside the existing `debug()` export and route it to
`console.trace` under that same switch. This is an internal logger contract only; do not mention
it in any user-facing label or description.

Add unit tests with console spies covering enabled/disabled behavior and prefixing. The visible
settings copy must remain the simple label/description specified in this plan.

### 8. Build focusable presentation components

Create small stateless components so focus behavior can be tested without backend timing.

#### Settings section

Use `PanelSection`, `PanelSectionRow`, and two `ToggleField` controls:

- `Achievement bar`
  - checked from `feature_enabled`;
  - concise description that it shows achievement progress on game details pages.
- `Debug logging`
  - checked from `debug_logging`;
  - concise verbose-troubleshooting description.

Set `highlightOnFocus={true}`. Disable a toggle while initial settings are unresolved or its own
save is in flight. Each toggle must be independently reachable and operable with gamepad focus.

#### Versions section

Use `PanelSection title="Versions"`. Render **three separate** `PanelSectionRow` + `Field`
entries—one each for `Plugin`, `Decky Loader`, and `SteamOS`. Every `Field` must set:

```tsx
focusable={true}
highlightOnFocus={true}
```

Show `Unknown` for empty/whitespace-only values. Keeping rows separate is required so all three
version values are independently focusable rather than sharing one focus target.

Wrap the overall content in a root `Focusable` navigation group with vertical child flow and a
preferred-child strategy supported by the installed `@decky/ui`. Do not add inert unfocusable
status copy above the controls.

Add frontend tests that inspect/render the stateless components and prove:

- two independently focusable toggle controls with the exact visible labels;
- no internal log-level terminology appears in the rendered settings copy;
- three independently focusable, highlighted version fields;
- empty values render as `Unknown`;
- the panel root is a focusable navigation group.

Prefer the lightest test approach compatible with the existing Vitest setup. Add a small React
test renderer only if direct element inspection cannot prove the contracts.

### 9. Wire asynchronous state, persistence, and rollback

Replace the static `Content` in `src/index.tsx` with stateful content receiving the lifecycle
controller.

On mount:

- load settings and versions concurrently;
- ignore late promise resolution after unmount;
- apply the loaded diagnostics switch before emitting optional diagnostic messages;
- call `controller.setEnabled(settings.feature_enabled)` once settings resolve;
- fall back to defaults and `Unknown` presentation on failures without crashing the QAM.

On toggle:

- optimistically update the requested UI/runtime state;
- mark only that toggle busy;
- persist through its explicit backend setter;
- reconcile both settings keys from the returned normalized payload;
- if persistence rejects, roll back the UI, logger, and feature controller to the previous value;
- log the failure without leaving the toggle permanently disabled.

On Decky dismount, call `controller.dispose()` even if React effect cleanup has already run.
Controller/disposer idempotence must make double cleanup harmless.

### 10. Update durable agent guidance

Add terse facts to `AGENTS.md`:

- settings live in the plugin settings directory and default to feature-on/diagnostics-off;
- disabling the feature must clean mounted instance props, not only unpatch prototypes;
- installed plugin version comes from the packaged manifest; Decky and SteamOS versions come
  from runtime/OS sources;
- settings and all version rows must remain gamepad-focusable.

---

## Quality Gates

Run before marking any round complete:

```bash
npm test
npx tsc --noEmit
npm run build
python3 -m py_compile main.py
uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git diff --check
git status --short
```

The round is incomplete unless frontend/backend tests, typecheck, production build, Python
syntax, orchestration gates, and review-note integrity all pass with a clean committed worktree.

---

## Verification

### Automated acceptance

- Backend tests cover persistence, defaults, log levels, and every version source.
- Frontend tests cover reversible patch lifecycle, controller idempotence, persistence rollback,
  logger gating, exact visible labels, and focus props.
- `npm run build` packages no Node-only API into the frontend bundle.
- Existing achievement capture/navigation tests remain green.

### On-device smoke test

Human-gated after integration into `dev`; do not silently install or navigate the user's Deck.
Package and install the exact build, then verify:

1. Opening the plugin gives focus to a child control, and D-pad navigation can visit both
   toggles and each of the three version rows independently.
2. The three displayed versions match the installed plugin manifest, Decky settings About page,
   and `/etc/os-release` respectively.
3. Turning `Achievement bar` off removes the bar from the currently open eligible game page
   without a Steam UI reload; navigation to another game keeps it absent.
4. Turning it back on restores the bar on the current/next eligible page without duplicate rows
   or layout regressions.
5. The feature setting survives plugin reload and Decky restart; a saved-off plugin does not
   flash the bar during startup.
6. The diagnostics setting survives reload and controls the expected frontend/backend diagnostic
   output while ordinary info/warning/error logs remain available.
7. Rapid toggling, backend failure, disable/re-enable, and plugin dismount do not white-screen,
   leak timers, or leave a stuck disabled control.

The user-facing panel copy must remain concise and must not reveal internal logging-level
implementation details.

---

## Mark Round Complete

When implementation, tests, docs, commits, and all quality gates are complete:

```bash
scripts/orchestration/mark-finished focusable-settings-versions-panel
```

This writes:

```text
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finished
```

Then exit cleanly. The orchestrator can resume the implementation through
`scripts/orchestration/continue-implementer focusable-settings-versions-panel`.

---

## Review Polling Loop

After marking the round complete, inspect and poll only for:

```text
docs/review/focusable-settings-versions-panel-review-*.md
```

When the newest note ends in `STATUS: CHANGES_REQUESTED`:

1. Read and address every item.
2. Clear the marker:

   ```bash
   scripts/orchestration/clear-finished focusable-settings-versions-panel
   ```

3. Run all quality gates and the review-note deletion check.
4. Commit implementation/docs fixes and the review note itself.
5. Recreate the marker:

   ```bash
   scripts/orchestration/mark-finished focusable-settings-versions-panel
   ```

Do not write a review or delete review records.

---

## Approval Handling

When the latest orchestrator-authored review ends in `STATUS: APPROVED`:

```bash
scripts/orchestration/check-review-notes-committed focusable-settings-versions-panel
git status --short
scripts/orchestration/finalize focusable-settings-versions-panel
```

Confirm the finalized marker exists:

```text
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finalized
```

Then stop polling and exit cleanly.

---

## Finalization Rules

Finalize only after an orchestrator-authored review note ends with:

```text
STATUS: APPROVED
```

Use only:

```bash
scripts/orchestration/finalize focusable-settings-versions-panel
```

Do not manually merge into `dev` unless finalization fails and the user or orchestrator
explicitly directs recovery. Leave both markers in place:

```text
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finished
/tmp/Decky-SteamAchievements/focusable-settings-versions-panel_finalized
```
