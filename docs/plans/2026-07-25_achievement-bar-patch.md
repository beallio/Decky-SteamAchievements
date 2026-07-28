# Plan: Restore achievement bar via onSeek route patch (achievement-bar-patch)

## Context

**Problem.** Valve removed the achievement progress bar from the Steam Deck
game-details page — the compact "ACHIEVEMENTS n/total" stat with a progress bar
that sat next to PLAY TIME, plus a blue completion ribbon at 100%.

**Root cause (already proven — see `HANDOFF.md`).** The bar is Valve's own
`MiniAchievements` component inside the app-details PlayBar (`GameStatsSection`).
It was NOT deleted. In Steam changelist 10546225 (~2026-03-24) Valve added one
guard to its `render()`: `if (!this.props.onSeek) return null;`. The Deck's
game-details header renders its PlayBar with `onSeek: undefined`, so the guard
returns `null` and the bar disappears. Supplying a real `onSeek` makes Valve's
own component render again with live data — this was verified on-device by
injecting `onSeek` into the running instance (`assets/achievement-bar-restored.png`).

**Intended outcome.** A React route patch that supplies the missing `onSeek` to
the app-details PlayBar so Valve's `MiniAchievements` renders. We do NOT
reimplement the bar — we only feed the prop Valve withheld. The patch must fail
closed: if the tree shape changes, it no-ops (page unchanged), never throws into
Steam's render.

**Relevant files.**
- `src/achievementBar.tsx` — current scaffold: `installAchievementBarPatch()`.
- `src/index.tsx` — `definePlugin`; installs the patch, unpatches on dismount.
- `src/log.ts` — namespaced logger.
- `HANDOFF.md` — authoritative research (root cause, runtime facts, mobx caveat,
  store handle, the resilient-matching guidance). Read it before starting.

**Constraints (from `AGENTS.md`).** Match components by stable signatures (the
`onSeek("achievements")` source string, CSS-module key names like
`MiniAchievements`/`GameStatsSection`), never by hashed classnames or minified
locals. `MiniAchievements` is a mobx `observer` — do not try to patch its
`render`; supply `onSeek` from the parent. Wrap all patch logic in try/catch and
return props unchanged on any failure.

**Slug used throughout this plan:** `achievement-bar-patch`

---

## Orchestration Contract

**Slug:** `achievement-bar-patch`

**Plan file:**

```text
docs/plans/2026-07-25_achievement-bar-patch.md
```

**Implementation branch:**

```text
feat/achievement-bar-patch
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-patch_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-patch_finalized
```

**Review notes:**

```text
docs/review/achievement-bar-patch-review-*.md
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
git checkout -b feat/achievement-bar-patch
```

Commit this plan first:

```bash
git add docs/plans/2026-07-25_achievement-bar-patch.md
git commit -m "docs(plan): add achievement-bar-patch implementation plan"
```

---

## Implementation Tasks

Do these in order. TDD: write the test for each pure unit before/with its
implementation. Tests operate on **plain objects** that mimic React element /
class-instance shapes (`{ props: {...} }`) — do NOT render React, so no jsdom is
needed. All work is code + unit tests only; there is NO device step in this plan
(on-device verification is deferred and human-gated — see Verification).

1. **Patch the route's `renderFunc`, NOT `props.children`.** `routerHook.addPatch(path, cb)`
   calls `cb` with the route props *before* the route content renders — `props.children`
   does **not** yet contain the PlayBar, so a `findInReactTree(props.children, …)`
   search finds nothing and the patch silently no-ops. Correct structure in
   `installAchievementBarPatch(): () => void`:
   - `const routePatch = routerHook.addPatch("/library/app/:appid", (props) => { … return props; })`.
   - Inside that callback, patch the route's **render function** (NOT `props.children`
     itself) so you can search its *returned* tree:
     `const renderPatch = afterPatch(props.children.props, "renderFunc", (_args, ret) => { …; return ret; })`.
     `afterPatch` is from `@decky/ui`; it returns a **`Patch` object whose disposer is
     `renderPatch.unpatch()` — it is NOT a callable**. Confirmed shape in
     `node_modules/@decky/ui/src/utils/patcher.ts` (`interface Patch { unpatch(): void }`).
   - **Shape guard (fail closed):** only patch when
     `typeof props.children?.props?.renderFunc === "function"`. If `renderFunc` is
     missing or not callable, `log.warn` and return `props` unchanged WITHOUT calling
     `afterPatch` — never wrap `undefined`.
   - In the inner hook: `const target = findInReactTree(ret, isSuppressedAchievementPlayBar)`;
     `injectOnSeek(target, handler)`; `return ret`.
   - **Track the patched owner across navigations.** Keep a module/closure reference
     to the last-patched render owner (`props.children.props`) and its `renderPatch`.
     When the outer route callback fires: if the owner is the SAME object, skip
     (already patched); if it is a DIFFERENT object, `renderPatch.unpatch()` the old
     one first, then patch the new owner and store the new pair. This prevents
     double-wrapping on re-render and stale patches after navigation.
   - **Dispose everything** in the returned unpatch:
     `routerHook.removePatch("/library/app/:appid", routePatch)` **and** the current
     `renderPatch.unpatch()` (if one is held). Every disposer call is guarded.
   - Guard **every** layer in try/catch; on any error `log.warn` and return the
     original value unchanged (never throw into render).
   - The injected handler may be a no-op for v1 (bar becomes visible; click does
     nothing); log the section via `log.debug`. Do not wire real navigation here.

   Pure, unit-testable helpers (keep exported):
   - `export function isSuppressedAchievementPlayBar(node: any): boolean`
   - `export function injectOnSeek(node: any, handler: (s: string) => void): boolean`
     — injects only when suppressed; returns whether it injected; never throws.

2. **Matcher — signature-first, not generic** (do NOT match purely on prop shape).
   A bare "has `onSeek`+`details`+`overview`" test can match unrelated guarded UI.
   Anchor on a stable Valve signature, then use prop-shape as a secondary guard:
   - **Primary:** the target is the node whose component function source contains
     the literal `onSeek("achievements")`, OR whose element carries the Valve
     CSS-module class key `MiniAchievements`/`GameStatsSection` (resolve the class
     map via require-capture/`findModuleChild` if needed — see `HANDOFF.md`
     §runtime facts). Never hashed classnames or minified module ids.
   - **Secondary:** among signature matches, require own props `onSeek == null` +
     `details` + `overview`, and never overwrite an `onSeek` that is already a function.

3. **Tests `src/achievementBar.test.tsx`** (vitest, plain objects — no jsdom):
   - `isSuppressedAchievementPlayBar`: true for a signature-anchored suppressed node;
     false when `onSeek` is a function (no clobber); false when `details`/`overview`
     missing; false for `null`/`{}`; **false for a generic node with the prop shape
     but WITHOUT the Valve signature**.
   - `injectOnSeek`: sets a function + returns true on a suppressed node; leaves an
     existing function untouched + returns false; returns false (no throw) on malformed.
   - **Integration-ish lifecycle:** mock `@decky/api` `routerHook` and `@decky/ui`
     `afterPatch`/`findInReactTree`. Invoke a representative `renderFunc` (a fake
     returning a tree that contains a suppressed PlayBar) and assert `onSeek` is
     injected into the **rendered** tree; assert `installAchievementBarPatch()`
     registers `/library/app/:appid`; assert the returned unpatch removes **both**
     the route patch and the inner `afterPatch` disposer.
   - **Shape guard:** a route-props object whose `children.props.renderFunc` is
     missing / non-callable → `afterPatch` is NOT called, props returned unchanged,
     no mutation, no throw.
   - **Two-navigation lifecycle:** fire the outer route callback twice with
     DIFFERENT owner objects (`children.props`) → assert the first owner's
     `renderPatch.unpatch()` is called before the second owner is patched; fire it
     again with the SAME owner → assert no re-patch. The final returned unpatch
     disposes the currently held `renderPatch`.
   - **Exception paths:** frozen/throwing props, a `findInReactTree` that throws,
     and a `removePatch`/disposer that throws — each caught, logged, render output
     unchanged, no throw escapes.

4. **Confirm `src/index.tsx`** still installs on load and unpatches in `onDismount`
   inside try/catch. Adjust only if the refactor changed the export surface.

5. **Do not** add backend deps, reimplement the bar, hardcode module ids or hashed
   CSS classes, or introduce jsdom/react-dom into tests.

**Files in scope:** `src/achievementBar.tsx`, `src/achievementBar.test.tsx`,
`src/index.tsx` (only if the export surface changed). The `scripts/package.mjs`
identity and the `definePlugin` import were already corrected outside this plan —
do not touch them.

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

**Implementer-verifiable (this is the round's definition of done):**

```bash
npm install
npx tsc --noEmit          # typecheck clean
npm run build             # rollup via @decky/rollup -> dist/index.js emitted
npm test                  # vitest: all achievementBar tests pass
```

Round is complete only when typecheck, build, and tests all pass and the working
tree is clean. `scripts/orchestration/run-quality-gates` runs the project
`quality-gates` hook (build + tests) and must exit 0.

**Device smoke test — the implementer does NOT run it, but it is a REQUIRED gate
before final approval / finalize (human-run).** Code+build+tests passing marks the
implementation *round* complete, but this plan is not APPROVED until a human has
confirmed the bar actually renders on the Deck. This is required because the
render-stage assumption (Task 1) can only be proven on-device. Human procedure:
- open a game with achievements on the Deck (app-details page),
- from `/tmp/Decky-SteamAchievements/scripts/` run the read-only CDP probe
  (`cdp_dom.py`) against `ssh deck@<deck-host>` and assert the `MiniAchievements`
  element count goes 0 → 1 with text like "ACHIEVEMENTS n/total".
Exact sequence (record each result as the approval evidence):
0. **Refresh selectors first:** the probe's hashed CSS classes (`MiniAchievements`,
   `GameStatsSection`) are build-specific and churn between Steam updates. Before
   probing, re-resolve them for the CURRENT Deck build from the live CSS-module map
   (match by the stable module KEY name, not a baked hash), and record the resolved
   hashes + the Deck build CL with the evidence. Do not trust the hashes hardcoded in
   `cdp_dom.py`.
1. **Baseline (plugin OFF):** on the Deck, open a game with achievements
   (app-details page). Run `cdp_dom.py` (from `/tmp/Decky-SteamAchievements/scripts/`,
   via `ssh deck@<deck-host>`) and confirm `MiniAchievements` element count = **0**
   on that page.
2. **Deploy + enable:** `npm run build` then `npm run package`; install the zip via
   Decky (or copy `dist/` to `~/homebrew/plugins/Decky-SteamAchievements/`); enable the
   plugin and reload the Steam UI (Decky "Reload" / restart Steam).
3. **Verify (plugin ON):** return to the **same** game's app-details page, re-run
   `cdp_dom.py`, and confirm count = **1** with text like "ACHIEVEMENTS n/total"
   (matching live `GetAchievements` numbers).
4. **Toggle off:** disable the plugin, reload, confirm the page returns to count = 0
   (clean unpatch, no residual DOM).

Reference procedure/scripts: `HANDOFF.md` (§runtime facts).
If any step fails (bar absent when ON, not removed when OFF, or the route path /
render-stage / tree shape differs from Task 1), that is **CHANGES_REQUESTED on this
plan** — the reviewer records it as a review note and the implementer resolves it in
a new round. Do not finalize on a green build alone.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished achievement-bar-patch
```

This writes:

```text
/tmp/Decky-SteamAchievements/achievement-bar-patch_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer achievement-bar-patch`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/achievement-bar-patch-review-*.md
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
   scripts/orchestration/clear-finished achievement-bar-patch
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
   git add docs/review/achievement-bar-patch-review-*.md
   git commit -m "docs(review): record achievement-bar-patch review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished achievement-bar-patch
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer achievement-bar-patch` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed achievement-bar-patch
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize achievement-bar-patch
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/achievement-bar-patch_finalized
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
scripts/orchestration/finalize achievement-bar-patch
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/achievement-bar-patch_finished
/tmp/Decky-SteamAchievements/achievement-bar-patch_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
