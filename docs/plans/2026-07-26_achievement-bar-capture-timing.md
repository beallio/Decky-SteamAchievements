# Plan: Fix achievement bar capture timing (defer capture, refresh mounted instances) (achievement-bar-capture-timing)

## Context

**Problem (found in the on-device smoke test of the merged `achievement-bar-prototype-patch`
work).** The plugin loads and its route patch registers, but the achievement bar never
appears on the Deck. Root cause is confirmed **timing**, not logic: `installAchievementBarPatch`
calls `captureMiniAchievementsClass(...)` **synchronously inside the route-render callback**.
That callback fires while the app-details route is *rendering*, before its subtree commits to
the Big Picture window's DOM. At that instant the BPM document's committed tree is still the
previous page, so the fiber DFS finds no `MiniAchievements` (`onSeek("achievements")`) class →
capture returns `undefined` → the prototype is never patched → the bar is never restored.

This was verified live via CEF this session:
- The plugin's route patch **is** registered (`/library/app/:appid` present in the router hook).
- The live `MiniAchievements` instance has **no** `__achRestored` flag and `props.onSeek` is
  `undefined` — i.e. the render patch handler never ran (prototype never patched).
- Replaying the plugin's **exact** capture logic *after* commit succeeds
  (`getBigPictureDocument` → `getFiberFromDocument` finds a fiber via the
  `querySelectorAll` fallback since `document.body` has no fiber key → climb to root → DFS by
  signature → `ieFound: true`, ~900 fibers). So `captureMiniAchievementsClass` is correct; only
  its call **timing** is wrong.
- The complete fix below (defer capture to after commit + refresh already-mounted instances)
  was validated live: the bar renders inline with live data and the layout stays native-clean
  (matches `assets/achievement-bar-restored.png`). Ground-truth reference script:
  `/tmp/Decky-SteamAchievements/scripts/ctp_fixval.py` (`/tmp` is ephemeral; the logic is
  embedded below).

There is a second, related gap: even once the prototype is patched, an **already-mounted**
`MiniAchievements` instance (the one on the page when capture finally succeeds) has already
rendered `null` and will not re-render on its own, so the bar would only appear on the *next*
app-details navigation. The fix must also refresh currently-mounted instances so the bar
appears on the current page.

**Intended outcome.** The installed plugin restores the bar on the app-details page without
requiring the user to navigate away and back after the plugin loads: capture runs after the
route commits, and both future and already-mounted `MiniAchievements` instances get `onSeek`
supplied and are force-re-rendered. All behavior stays fail-closed (never throws into Steam's
render path) and non-invasive (no remounts — do not reintroduce tree-descent / `wrapReactClass`).

**Relevant files:** `src/achievementBar.tsx` (targeted changes to the capture trigger + a small
refactor to share the per-instance restore logic and to surface captured instances),
`src/achievementBar.test.tsx` (add/adjust tests for the deferred trigger and instance refresh).
The proven mechanism from the prior plan (prototype `render` patch + persistent `props` getter
+ out-of-band `forceUpdate`, class captured read-only via `g_PopupManager` → BPM document →
fiber DFS by the `onSeek("achievements")` signature) is correct and stays — this plan only
fixes *when* capture runs and *which* instances get refreshed.

**Slug used throughout this plan:** `achievement-bar-capture-timing`

---

## Orchestration Contract

**Slug:** `achievement-bar-capture-timing`

**Plan file:**

```text
docs/plans/2026-07-26_achievement-bar-capture-timing.md
```

**Implementation branch:**

```text
feat/achievement-bar-capture-timing
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finalized
```

**Review notes:**

```text
docs/review/achievement-bar-capture-timing-review-*.md
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
git checkout -b feat/achievement-bar-capture-timing
```

Commit this plan first:

```bash
git add docs/plans/2026-07-26_achievement-bar-capture-timing.md
git commit -m "docs(plan): add achievement-bar-capture-timing implementation plan"
```

---

## Implementation Tasks

Follow TDD. Keep every runtime path fail-closed (try/catch, no-op, log via `src/log.ts`) — a
broken patch must never throw into Steam's render. Do **not** reintroduce tree-descent,
`wrapReactClass`, `createReactTreePatcher`, `findInReactTree`, `findModuleExport`, or `SP_REACT`.
This is a small, surgical change to the existing `src/achievementBar.tsx` — reuse the current
units (`hasAchievementRenderSignature`, `withOnSeek`, `findAncestorStateNode`,
`findClassInFiberTree`, `resolveSeekController`, `getBigPictureDocument`, the fiber helpers) and
do not rewrite them.

1. **Factor the per-instance restore into a reusable, testable unit.** The restore currently
   lives inline in `patchMiniAchievementsRender`'s render handler. Extract it, e.g.
   **`restoreInstance(instance): void`** — idempotent per instance (guard on the existing
   `INSTANCE_PATCH_FLAG` = `__achRestored`); build `onSeek = (section) => { try {
   resolveSeekController(instance)?.SeekToSection?.(section); } catch {} }`; install the
   persistent `props` getter via `Object.defineProperty(instance, "props", { get, set })`
   seeded with `withOnSeek(instance.props, onSeek)` (setter re-wraps with `withOnSeek`); then
   `setTimeout(() => { try { instance.forceUpdate?.(); } catch {} }, 0)`. All wrapped.
   `patchMiniAchievementsRender`'s handler becomes just `restoreInstance(this)` (behavior
   identical to today for future renders). Tests: calling `restoreInstance` twice on the same
   instance defines `props`/schedules `forceUpdate` only once; the getter supplies `onSeek`;
   the setter re-wraps a replacement `props`; `onSeek(section)` calls the resolved controller's
   `SeekToSection`; no throw when controller/`forceUpdate` are absent.

2. **Surface captured instances alongside the class.** So the trigger can refresh what's
   already mounted, make capture return both. Either change
   **`captureMiniAchievementsClass`** to return `{ MiniClass, instances }` (the DFS already
   walks fibers — collect each `fiber.stateNode` whose `elementType||type` matches
   `hasAchievementRenderSignature`, capped/bounded), or add a sibling
   **`captureMiniAchievements(popupManager): { MiniClass?, instances: any[] }`** and keep the
   old export as a thin wrapper if other call sites/tests need it. Prefer the single
   `{ MiniClass, instances }` shape and update the existing capture test accordingly. Wrapped;
   returns `{ MiniClass: undefined, instances: [] }` on any failure. Tests: composes popup
   lookup + root climb + DFS to return the signature class **and** its mounted instances from a
   mock fiber tree; returns empties without throwing on malformed input.

3. **Defer the capture trigger to after commit, and refresh mounted instances.** In
   `installAchievementBarPatch`'s route callback, stop calling capture synchronously. Instead,
   when not yet patched and no attempt is in flight, schedule the attempt with
   `setTimeout(() => attemptCaptureAndPatch(), 0)` so it runs after the current route render
   commits to the BPM document. `attemptCaptureAndPatch`:
   - if already patched, return;
   - `const { MiniClass, instances } = captureMiniAchievements(steamGlobals.getPopupManager())`;
   - if no `MiniClass`, clear the in-flight flag and return (a later app-details navigation
     schedules another attempt — capture is retried until it succeeds, then stops);
   - otherwise `prototypePatch = patchMiniAchievementsRender(MiniClass, { afterPatch })` (guard
     so the prototype is patched exactly once), then call `restoreInstance(inst)` for each
     captured instance so the bar appears on the **current** page without another navigation.
   - Guard against overlapping scheduled attempts (e.g. an `attemptScheduled`/`patched` flag)
     so rapid re-renders don't stack timers or double-patch. Always `return props` untouched.
   - The disposer is unchanged in spirit: `removePatch` + `prototypePatch?.unpatch()`, each
     wrapped independently; also clear any pending scheduled attempt if that is cheap to track.
   Keep `steamGlobals.getPopupManager()` injectable for tests, and inject/override the timer in
   tests (e.g. `vi.useFakeTimers()` + `vi.runAllTimers()`, following the existing
   `patchMiniAchievementsRender` test) rather than adding a new seam unless needed.
   Tests (extend the existing `installAchievementBarPatch` suite, mocking `@decky/api`,
   `@decky/ui`, `./log`, `steamGlobals.getPopupManager`, and timers):
   - the route callback returns `props` untouched and does **not** patch synchronously; capture
     runs only after the scheduled timer fires;
   - once the timer fires with a capturable class, the prototype is patched exactly once and
     each captured mounted instance is restored (assert `forceUpdate`/`onSeek` on the mocked
     instances);
   - a second render/timer does not re-patch or re-restore an already-restored instance;
   - when capture returns no class, nothing is patched and a later app-details render schedules
     and succeeds on a subsequent attempt;
   - the disposer calls `removePatch` and the prototype `unpatch`, and still calls both if the
     first throws;
   - the route callback and the scheduled attempt never throw on malformed `props`/globals;
   - registration failure still returns a safe no-op disposer.

3a. Update any existing tests that assumed **synchronous** capture inside the route callback
   (the prior suite asserted `afterPatch` was called during the render callback) to the new
   deferred timing (advance timers, then assert). Do not weaken assertions to pass — assert the
   new, correct behavior.

4. **Docs.** Add one short note to `AGENTS.md` "Decky runtime facts": capture must run **after**
   the app-details route commits to the BPM document (defer with `setTimeout`), and the trigger
   must refresh already-mounted `MiniAchievements` instances, because a synchronous
   route-render capture runs before the BPM subtree commits and finds nothing. Keep it terse.

No other files should change. Do not touch `src/index.tsx` (the `installAchievementBarPatch()`
entry contract is unchanged).

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

Automated (must pass before marking the round complete):

```bash
npm install            # or pnpm install
npm test               # vitest run — all unit tests green, including new deferred/refresh tests
npx tsc --noEmit       # typecheck clean
npm run build          # rollup -> dist/index.js, no errors
scripts/orchestration/run-quality-gates
```

Expected: capture is no longer invoked synchronously in the route callback (a test asserts it
runs only after the scheduled timer); mounted-instance refresh is covered; `tsc` and build
clean; no `createReactTreePatcher` / `wrapReactClass` / `findInReactTree` / `findModuleExport`
/ `SP_REACT` references in `src/achievementBar.tsx`.

**Deferred — on-device smoke test (human-gated; do NOT install to the Deck yourself, do NOT
block the round on it).** After `dev` integration, a human packages (`npm run package`),
installs the zip on the Deck, and confirms: with the plugin already enabled, opening a game
with achievements (e.g. Brotato) shows the "ACHIEVEMENTS n/total" bar inline next to Play Time
with live data and the blue ribbon **on the first view, without needing to navigate away and
back**; layout stays native-clean (2 action icons + "STEAM CLOUD" line, correct play-row
gradient, no store-tabs strip); navigating away and back keeps the bar; the Steam UI never
crashes; disabling/dismounting removes the patch cleanly. Note this deferred step in the
session log when marking the round complete.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished achievement-bar-capture-timing
```

This writes:

```text
/tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer achievement-bar-capture-timing`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/achievement-bar-capture-timing-review-*.md
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
   scripts/orchestration/clear-finished achievement-bar-capture-timing
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
   git add docs/review/achievement-bar-capture-timing-review-*.md
   git commit -m "docs(review): record achievement-bar-capture-timing review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished achievement-bar-capture-timing
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer achievement-bar-capture-timing` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed achievement-bar-capture-timing
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize achievement-bar-capture-timing
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finalized
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
scripts/orchestration/finalize achievement-bar-capture-timing
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finished
/tmp/Decky-SteamAchievements/achievement-bar-capture-timing_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
