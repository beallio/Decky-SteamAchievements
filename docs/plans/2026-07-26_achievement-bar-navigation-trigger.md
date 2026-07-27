# Plan: Trigger achievement capture from real app-details renders (achievement-bar-navigation-trigger)

## Context

The merged `dev` build (`21429f2`) contains the correct restoration mechanism but does not
reliably invoke it. The installed Deck bundle exactly matches the local build, the plugin and
its `/library/app/:appid` route patch are registered, and the current Brotato page contains one
live `MiniAchievements` class and mounted instance. That instance still has
`props.onSeek === undefined` and no own `__achRestored` flag. Replaying the plugin's exact
read-only capture logic against the committed page finds the class and instance immediately.

The failure is the trigger contract in `installAchievementBarPatch()`. A callback passed to
`routerHook.addPatch()` transforms Decky's route table when that table is rebuilt; it is not a
per-navigation callback. The plugin currently schedules one deferred capture from that
route-table callback. If no committed app-details tree exists then, capture returns no class
and the plugin goes idle forever. Opening a game later does not invoke the callback again.

The unit test named "retries capture on the next render" models the wrong contract by calling
the stored route-table callback a second time. It therefore passes while the real plugin fails.

The previous implementation established one useful, live-proven hook: the route definition's
`children.props.renderFunc` runs when app details render. Its output is too shallow to locate or
modify `MiniAchievements`, but it is suitable as a signal. This plan restores an `afterPatch`
on that method solely to schedule the existing cross-window fiber capture after the render
commits. It must return the rendered tree untouched and must never descend, wrap, or remount
any app-details component.

### Intended outcome

- Installing/reloading the plugin while a game page is already open restores the bar on that
  page.
- Installing/reloading on Library Home and opening a game minutes or hours later restores the
  bar on the first visit.
- A short commit-timing race retries within a bounded burst; there is no permanent poll.
- `MiniAchievements` is captured and prototype-patched once, current mounted instances are
  refreshed, and subsequent renders do no extra capture work.
- Valve's component, layout, CSS, and achievement store remain the only rendering/data path.

### Non-goals

- Do not reimplement the achievement bar.
- Do not inspect or mutate `renderFunc`'s returned tree.
- Do not use `findInReactTree`, `createReactTreePatcher`, `wrapReactClass`, `wrapReactType`,
  `findModuleExport`, hashed class names, or minified component names.
- Do not change the QAM content, packaging, backend, updater, or release metadata.
- Do not redesign instance cleanup in this fix; record any cleanup concern separately.

---

## Orchestration Contract

**Slug:**

```text
achievement-bar-navigation-trigger
```

**Plan file:**

```text
docs/plans/2026-07-26_achievement-bar-navigation-trigger.md
```

**Base branch:**

```text
dev
```

**Implementation branch:**

```text
feat/achievement-bar-navigation-trigger
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finalized
```

**Review-note glob:**

```text
docs/review/achievement-bar-navigation-trigger-review-*.md
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
5. Follow TDD: first replace the false route-callback retry test with a test that fails against
   the current implementation and models Decky's actual lifecycle.
6. Run all quality gates before marking a round complete.
7. Do not write your own review or create/delete files under `docs/review/`.
8. Treat review notes as durable audit records and commit them when resolving a round.
9. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Primary code scope: `src/achievementBar.tsx` and `src/achievementBar.test.tsx`.
- Documentation scope: `AGENTS.md` and `docs/deep-patch-notes.md` only.
- `src/index.tsx` must keep the existing `installAchievementBarPatch(): () => void` contract.
- Preserve `hasAchievementRenderSignature`, cross-window popup/fiber capture,
  `patchMiniAchievementsRender`, `restoreInstance`, and `resolveSeekController` unless a small
  mechanical change is required by the trigger state machine.
- All Steam, Decky, popup, fiber, timer, and patch access must remain fail-closed.
- Do not turn an expected "class not mounted yet" result into a warning or exception.
- If unrelated defects are found, record them for a separate plan.

---

## Setup

Start from the local integration branch:

```bash
git checkout dev
git checkout -b feat/achievement-bar-navigation-trigger
```

Commit this plan first:

```bash
git add docs/plans/2026-07-26_achievement-bar-navigation-trigger.md
git commit -m "docs(plan): add achievement-bar-navigation-trigger plan"
```

---

## Implementation Tasks

### 1. Replace the false lifecycle test before changing production code

In `src/achievementBar.test.tsx`, replace the test that manually calls `routeCallback()` twice.
Build a small but behaviorally accurate harness:

- `routerHook.addPatch()` captures the route-table callback.
- Invoke that callback exactly once with a route-shaped object whose
  `children.props.renderFunc` is callable.
- Make the `afterPatch` mock actually wrap the specified method, preserve its `this`, arguments,
  and return value, and provide an idempotent `unpatch()`.
- Start with no capturable class and exhaust the first scheduled attempt/burst; assert that no
  prototype patch was installed.
- Later make the mock BPM tree capturable and invoke the same `renderFunc`—do not invoke the
  route-table callback again.
- Assert capture is deferred, then succeeds after timers advance; the prototype is patched once
  and every captured mounted instance is restored.

This test must fail against the current implementation for the diagnosed reason. Keep separate
tests for malformed route shape, timer/capture failures, idempotence, and disposer behavior.

### 2. Patch `renderFunc` as a signal only

Inside `installAchievementBarPatch()`:

1. Keep `routerHook.addPatch(APP_ROUTE, callback)` to access the stable route definition.
2. In that route-table callback, read `const owner = props?.children?.props` and require
   `typeof owner?.renderFunc === "function"`.
3. Install `afterPatch(owner, "renderFunc", handler)` once per owner. Track the owner and patch
   handle so a Decky route-table rebuild cannot stack duplicate patches.
4. The handler must:
   - call only the capture scheduler;
   - return the original rendered tree unchanged;
   - never inspect, search, mutate, wrap, or replace the tree;
   - never throw into Steam's render path.
5. Also request one initial capture burst after the route-table callback installs the signal.
   This covers a plugin loaded while an app-details page is already committed.

This deliberately reuses only the old method-level signal. It does not restore the old shallow
tree search and does not remount any React component.

### 3. Implement a coalesced, bounded capture burst

Replace the current single `attemptTimer` behavior with a small state machine, preferably behind
named helpers such as `scheduleCaptureBurst()` and `attemptCaptureAndPatch()`:

- Define a short fixed retry schedule in one constant, for example `[0, 50, 250, 1000]` ms.
  Exact values may be adjusted by tests, but the total window must remain short and bounded.
- An initial route-table install or a real `renderFunc` call starts a burst only when:
  - the plugin is not disposed;
  - the prototype is not already patched; and
  - no burst/timer is active.
- Each attempt calls the existing
  `captureMiniAchievements(steamGlobals.getPopupManager())`.
- If no class is present, schedule the next delay in the same burst. When the fixed schedule is
  exhausted, return to idle. A future `renderFunc` call starts a fresh burst even if it happens
  long after plugin load.
- If a class is present, call `patchMiniAchievementsRender()` exactly once and then call
  `restoreInstance()` for every captured mounted instance so the current page updates.
- On success, clear all pending attempt state and ignore future route signals.
- If prototype patch installation returns `undefined` or throws, fail closed, clear the burst,
  and allow a future real render to retry. Do not spin indefinitely.
- Use `safeInfo` once for successful class/prototype capture and `safeDebug` for normal misses.
  Unexpected patch/timer failures may use `safeWarn`.

There must be no permanent interval, background polling while the user is outside app details,
or overlapping timers during rapid renders.

### 4. Make disposal cover every installed trigger

The disposer must independently and safely attempt all applicable cleanup:

- mark the plugin disposed first;
- clear the active capture timer/burst state;
- unpatch the route `renderFunc` signal;
- remove the Decky route-table patch;
- unpatch `MiniAchievements.prototype.render` if it was installed;
- log cleanup completion without allowing one cleanup failure to skip the others.

Add tests proving that:

- disposing before a scheduled timer fires prevents capture and prototype patching;
- disposing after success calls both route-signal and prototype unpatchers;
- a throwing unpatch/remove operation does not prevent the remaining cleanup;
- invoking an old wrapped `renderFunc` after disposal cannot schedule work.

### 5. Correct documentation of the Decky lifecycle

Update `AGENTS.md` with two terse runtime facts:

- `routerHook.addPatch()`'s callback transforms the route table; it is not a navigation/render
  event and cannot by itself drive retries.
- Use an untouched `children.props.renderFunc` after-patch as the per-render signal, then defer
  and briefly retry capture until the BPM commit is visible.

Append a short superseding note to `docs/deep-patch-notes.md` explaining the trigger failure and
final lifecycle. Preserve the warning that `renderFunc` output is too shallow for component
searching and that tree descent/wrapping breaks the native page layout.

---

## Required tests

At minimum, the final suite must prove:

1. The route-table callback is invoked once, an initial no-class burst expires, and a later
   `renderFunc` invocation successfully triggers capture.
2. Capture is not performed synchronously inside `renderFunc`.
3. A class that appears on a later attempt within one burst is patched without another render.
4. Multiple rapid renders coalesce into one burst and one prototype patch.
5. A successful capture restores all currently mounted instances exactly once.
6. Once patched, later renders do not scan the fiber tree again.
7. Malformed route props, popup state, fibers, and throwing getters fail closed.
8. Every timer and patch is cleaned up on disposal.

Tests must model the distinction between the route-table callback and the actual route
`renderFunc`; no test may describe a second manual route-table callback invocation as a
navigation or render retry.

---

## Quality Gates

Run before marking any round complete:

```bash
npm test
npx tsc --noEmit
npm run build
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless all tests and build/typecheck gates pass, review notes remain
intact, all intended files are committed, and the working tree is clean.

---

## Verification

### Automated

Expected results:

- the new lifecycle test fails before the production change and passes afterward;
- all existing pure capture/signature/restore tests remain green;
- `src/achievementBar.tsx` contains no tree descent or React-class wrapping helpers;
- Rollup produces `dist/index.js` without errors.

### On-device smoke test

This is human-gated after integration into `dev`; do not silently install or navigate the
user's Deck. Package and install the exact `dev` build, then verify both lifecycle scenarios:

1. **Plugin loads away from app details:** reload/install from Library Home, wait longer than the
   entire bounded retry burst, then open Brotato. The bar must appear on that first game view.
2. **Plugin loads on app details:** with Brotato already open, reload/enable the plugin. The bar
   must appear without navigating away and back.

Also verify:

- live text shows the correct `ACHIEVEMENTS n/total` value and native blue progress bar;
- the page retains two action icons, the correct play-row gradient, the Steam Cloud line, and no
  store-tabs regression;
- navigating Home → Brotato and Brotato → another achievement game does not duplicate patches or
  bars;
- leaving the plugin idle on Home produces no continuing capture poll or log spam;
- Steam does not white-screen or crash, and disabling the plugin does not throw.

For read-only CDP confirmation after the visible check, inspect the live
`MiniAchievements` instance: it should own `__achRestored`, expose a callable `props.onSeek`,
and correspond to exactly one rendered achievement stat.

---

## Mark Round Complete

When implementation, tests, documentation, commits, and quality gates are complete:

```bash
scripts/orchestration/mark-finished achievement-bar-navigation-trigger
```

This writes:

```text
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finished
```

Then exit cleanly. The orchestrator can resume the implementer with
`scripts/orchestration/continue-implementer achievement-bar-navigation-trigger`.

---

## Review Polling Loop

After marking the round complete, check and poll only for:

```text
docs/review/achievement-bar-navigation-trigger-review-*.md
```

If the newest note ends in `STATUS: CHANGES_REQUESTED`:

1. Read and address every item.
2. Clear the marker:

   ```bash
   scripts/orchestration/clear-finished achievement-bar-navigation-trigger
   ```

3. Run quality gates and the review-note deletion check.
4. Commit code/docs fixes and the review note itself.
5. Recreate the marker:

   ```bash
   scripts/orchestration/mark-finished achievement-bar-navigation-trigger
   ```

Do not write a review, delete review notes, or treat an uncommitted note as disposable input.

---

## Approval Handling

If the latest review note ends in `STATUS: APPROVED`:

```bash
scripts/orchestration/check-review-notes-committed achievement-bar-navigation-trigger
git status --short
scripts/orchestration/finalize achievement-bar-navigation-trigger
```

Confirm the finalized marker exists:

```text
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finalized
```

Then stop polling and exit cleanly.

---

## Finalization Rules

Finalize only after an orchestrator-authored review note ends with:

```text
STATUS: APPROVED
```

Finalization must use:

```bash
scripts/orchestration/finalize achievement-bar-navigation-trigger
```

Do not manually merge into `dev` unless finalization fails and the user or orchestrator
explicitly directs recovery. Leave both orchestration markers in place:

```text
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finished
/tmp/Decky-SteamAchievements/achievement-bar-navigation-trigger_finalized
```

