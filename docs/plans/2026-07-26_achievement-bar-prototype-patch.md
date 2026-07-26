# Plan: Restore achievement bar via MiniAchievements prototype patch (achievement-bar-prototype-patch)

## Context

**Problem.** The shipped `src/achievementBar.tsx` restore mechanism does not work on the
current Steam build. It registers `routerHook.addPatch("/library/app/:appid", …)` and
`afterPatch`es the route's `renderFunc`, then searches that output for the suppressed
`MiniAchievements`/PlayBar element and injects `onSeek`. On-device this finds **zero**
targets: `MiniAchievements` is created several mobx-`observer` boundaries below the route
render, so the shallow renderFunc output never contains it. The plugin installs and loads
but the bar never appears.

**Live-proven root cause + fix (this is authoritative — verified on-device via CEF this
session; ground-truth reference scripts live in `/tmp/Decky-SteamAchievements/scripts/`,
notably `ctp_clean.py` = the full clean mechanism, `probe_seekowner.py` = the seek owner;
`/tmp` is ephemeral so the essential logic is embedded below).**

Valve's `MiniAchievements` still ships with working CSS + live `GetAchievements(appid)`
data. Its `render()` guards with `if (!this.props.onSeek) return null;` and the Deck header
renders the PlayBar with `onSeek: undefined`, so it renders null. Supplying `onSeek` makes
Valve's own component render again (do **not** reimplement the bar).

Two hard-won facts that dictate the mechanism:

1. **Do NOT use tree-descent / `createReactTreePatcher` / `wrapReactClass` to reach it.**
   Wrapping *any* component in the app-details subtree remounts Steam's content components,
   which flips the page into the fuller "store-tabs" variant (DLC / Community Hub / Points
   Shop / Discussions strip + extra action buttons) and breaks the play-row background
   gradient. Confirmed: even a single-path descender that never reached the target still
   caused it; native re-entry with no patch stays clean (2 action icons + "STEAM CLOUD"
   line). Element/prop mutations on a mobx observer's own render output are also discarded,
   and element `onSeek` injection only *commits* if the component is remounted (the invasive
   path). This whole class of approach is rejected.

2. **The clean mechanism** (no remount, no CSS, no layout side-effects — matches
   `assets/achievement-bar-restored.png` exactly):
   - Patch `MiniAchievements.prototype.render` directly with Decky's `afterPatch`
     (a prototype-method patch — **no** `wrapReactClass`, so no remount). `afterPatch` on
     `MiniAchievements.prototype.render` **works** on this build (proven live — the old
     AGENTS.md note that its `render` is "non-configurable, patch props not render" is stale
     and must be corrected).
   - In the render handler, once per instance: install a persistent `props` getter via
     `Object.defineProperty(this, "props", { get, set })` that always returns props with
     `onSeek` supplied (wrap incoming props in the setter too), then schedule an
     **out-of-band** re-render with `setTimeout(() => this.forceUpdate(), 0)`. The current
     render returns `null`; the scheduled `forceUpdate` re-renders+commits the bar. Doing it
     out-of-band (not mutating props inside the render pass) is what makes React commit it.

3. **Capturing the `MiniAchievements` class** (needed to patch its prototype). It is a
   module-internal local — `findModuleExport` cannot reach it, and the webpack module-cache
   handle reads empty. Capture it read-only from the live fiber tree (no wrapping, no
   remount): from SharedJSContext reach the main gamescope window's document via
   `window.g_PopupManager` — iterate its popups (`m_rgPopups` or `GetPopups()`), the one
   whose `p.m_popup.document` holds the app-details is titled "Steam Big Picture Mode" — then
   from `doc.body` follow `el["__reactFiber$…"]` (or `__reactContainer$…`) up to the root and
   DFS for a class where **`type.toString()` (the whole class, not `prototype.render`)**
   contains `onSeek("achievements")` (also try the single-quote variant). Cross-window
   fibers are readable from SharedJSContext and the found class is the *same object* as the
   SharedJSContext class, so patching its prototype takes effect. ~900 fibers walked; bound
   the DFS. `MiniAchievements` must have rendered at least once for its class to exist, so
   trigger capture when the app-details route is open.

4. **`onSeek` behavior (user decision: navigate to achievements).** Bind `onSeek` to Valve's
   own in-page seek, faithful to native: it is `SeekToSection(section)` on the app-details
   content controller (the `le` instance up the fiber chain — the nearest ancestor
   `stateNode` exposing a `SeekToSection` function, alongside `RegisterSection` /
   `m_mapSeekTargets`). Resolve that controller by walking up from the `MiniAchievements`
   instance's fiber and call `controller.SeekToSection(section)`. **Caveat (documented, not a
   bug):** on the current build the controller's registered seek targets are only
   `["activity"]` — "achievements" is not registered — so activation gracefully no-ops, same
   as native. If Valve re-registers an achievements section, this binding will scroll to it
   with no code change. The bar rendering with live data is the deliverable regardless.

**Intended outcome.** Replace the mechanism in `src/achievementBar.tsx` (and rewrite its
tests) so that, on the Deck game-details page, Valve's `MiniAchievements` bar renders inline
next to Play Time with live data, the surrounding layout stays native-clean (no store-tabs,
correct gradient), activation invokes Valve's `SeekToSection`, and any failure fails closed
(never throws into Steam's render path). `src/index.tsx` keeps calling
`installAchievementBarPatch()` and disposing it on dismount — that entry-point contract is
unchanged.

**Relevant files:** `src/achievementBar.tsx` (full rewrite), `src/achievementBar.test.tsx`
(full rewrite — the old `isSuppressedAchievementPlayBar` / `injectOnSeek` exports are
removed), `src/index.tsx` (only if the disposer/entry contract needs adjustment — prefer to
keep it as-is), `src/log.ts` (reuse), `AGENTS.md` + `README.md` + `docs/deep-patch-notes.md`
(doc updates below).

**Slug used throughout this plan:** `achievement-bar-prototype-patch`

---

## Orchestration Contract

**Slug:** `achievement-bar-prototype-patch`

**Plan file:**

```text
docs/plans/2026-07-26_achievement-bar-prototype-patch.md
```

**Implementation branch:**

```text
feat/achievement-bar-prototype-patch
```

**Round-complete marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finished
```

**Finalized marker:**

```text
/tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finalized
```

**Review notes:**

```text
docs/review/achievement-bar-prototype-patch-review-*.md
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
git checkout -b feat/achievement-bar-prototype-patch
```

Commit this plan first:

```bash
git add docs/plans/2026-07-26_achievement-bar-prototype-patch.md
git commit -m "docs(plan): add achievement-bar-prototype-patch implementation plan"
```

---

## Implementation Tasks

Follow TDD: for each pure/injectable unit below, write the vitest test first (red), then
implement (green). The DOM/fiber/`g_PopupManager`/`forceUpdate` edges are covered by unit
tests using plain mock objects (no real Steam) plus the on-device smoke test in Verification.
Every runtime path must be wrapped so a failure logs and no-ops — a broken patch must never
throw into Steam's render (see `AGENTS.md`). Use `src/log.ts` for logging.

Design `src/achievementBar.tsx` as small, individually testable, dependency-injected units so
the Steam globals are mockable. Suggested exports (names are guidance; keep them stable enough
to test):

1. **`hasAchievementRenderSignature(type): boolean`** — true iff `type` is a function whose
   `type.toString()` contains `onSeek("achievements")` or `onSeek('achievements')`. Wrapped
   in try/catch (stringification can throw). Pure. Tests: matches a class whose source
   contains the signature; rejects unrelated functions, non-functions, `null`, and a type
   whose `toString` throws (returns false, never throws).

2. **`withOnSeek(props, handler)`** — returns `props` unchanged if it already has a non-null
   `onSeek`; otherwise returns a shallow copy with `onSeek` set to `handler`. Non-object
   props returned as-is. Pure. Tests: adds handler when missing/`undefined`/`null`; leaves an
   existing handler untouched; passes through non-objects; never throws.

3. **`findAncestorStateNode(fiber, predicate)`** — walk `fiber.return` up to a bound depth,
   returning the first `fiber.stateNode` for which `predicate(stateNode)` is true, else
   `undefined`. Pure over mock fibers. Tests: finds a matching ancestor `stateNode`; returns
   `undefined` when none match within the bound; tolerates missing `.return`/`.stateNode`.

4. **`findClassInFiberTree(rootFiber, predicate, maxNodes?)`** — bounded DFS over
   `child`/`sibling` returning the first `fiber.elementType || fiber.type` for which
   `predicate(type)` is true, else `undefined`. Pure over mock fibers. Tests: finds a
   deeply-nested matching type; respects the node bound; returns `undefined` when absent.

5. **`getBigPictureDocument(popupManager)`** — from a `g_PopupManager`-shaped object, read
   `m_rgPopups`/`GetPopups()` (accept a Map, array, or iterable), and return the first
   `popup.m_popup.document` whose `body` (or a queryable element) exposes a React fiber key
   (`__reactFiber$…` / `__reactContainer$…`); prefer a popup titled "Steam Big Picture Mode"
   but fall back to any popup document that has one. Return `undefined` if none. Wrapped.
   Tests with mock popup managers (Map and array shapes): returns the BPM document; returns
   `undefined` when no popup/document/fiber key is present; never throws on malformed input.

6. **`captureMiniAchievementsClass(popupManager)`** — compose 5 + (`document.body`'s fiber →
   climb to root) + 4 with `hasAchievementRenderSignature` to return the `MiniAchievements`
   class or `undefined`. Wrapped. Test the composition with a mock popup manager whose
   document body carries a mock fiber root containing a signature-bearing class.

7. **`resolveSeekController(instance)`** — from a component instance, get its fiber
   (`instance._reactInternals` ?? `instance._reactInternalFiber`) and use
   `findAncestorStateNode` with a predicate `sn => typeof sn?.SeekToSection === "function"`.
   Return the controller or `undefined`. Wrapped. Tests: resolves a controller from a mock
   instance/fiber chain; returns `undefined` when absent; never throws.

8. **`patchMiniAchievementsRender(MiniClass, { afterPatch })`** — `afterPatch(MiniClass.
   prototype, "render", handler)` and return the resulting patch. The `handler(_, ret)` must,
   once per instance (guard with an own flag like `this.__achRestored`): resolve a stable
   `onSeek` = `(section) => { try { resolveSeekController(this)?.SeekToSection?.(section); }
   catch {} }`; install `Object.defineProperty(this, "props", { configurable: true,
   get: () => store, set: v => { store = withOnSeek(v, onSeek); } })` seeded with
   `store = withOnSeek(this.props, onSeek)`; then `setTimeout(() => { try { this.forceUpdate();
   } catch {} }, 0)`. Return `ret` unchanged. Everything try/caught. Tests (inject a fake
   `afterPatch` and drive the returned handler against a fake instance with a mutable `props`,
   a `forceUpdate` spy, and `_reactInternals`): supplies `onSeek` so `this.props.onSeek`
   becomes callable; the getter survives a later `props` set (setter re-wraps); `forceUpdate`
   is scheduled once; the per-instance guard prevents re-defining `props`; a call to the
   supplied `onSeek(section)` invokes the resolved controller's `SeekToSection` with the
   section; no throw when the controller is missing.

9. **`installAchievementBarPatch(): () => void`** — the public entry (keep the name and the
   `() => dispose` shape so `src/index.tsx` is unchanged). Behavior:
   - `routerHook.addPatch("/library/app/:appid", (props) => { …; return props; })`. The
     callback attempts capture-and-patch **once**: if not yet patched, read
     `window.g_PopupManager`, `captureMiniAchievementsClass(...)`; if a class is found,
     `patchMiniAchievementsRender(...)` and remember the patch; if capture returns
     `undefined` (BPM DOM may not be committed on the very first render), retry on the next
     app-details navigation (and optionally one `setTimeout` retry) — do not wrap/remount
     anything, and never throw. Always `return props` untouched.
   - The disposer removes the route patch (`routerHook.removePatch`) and, if present, unpatches
     the prototype patch (`patch.unpatch()`), each wrapped so one failure doesn't block the
     other, mirroring the existing fail-closed disposer.
   - Import `afterPatch` from `@decky/ui` and `routerHook` from `@decky/api` (as today). Access
     `window.g_PopupManager` via a typed `(window as any)` accessor that is injectable/mocked
     in tests. Do **not** import or use `createReactTreePatcher`, `wrapReactClass`,
     `wrapReactType`, `findInReactTree`, `findModuleExport`, or `SP_REACT`.
   - Tests (mock `@decky/api`, `@decky/ui`, `./log`, and the popup-manager accessor, following
     the existing test's `vi.mock` + `routeCallback()` pattern): registers the route patch and
     returns `props` unchanged; on an app-details render it calls capture then patches the
     prototype exactly once (a second render does not re-patch); when capture returns
     `undefined` it does not patch and retries on the next render; the disposer calls
     `removePatch` and the prototype `unpatch`, and still calls both when the first throws;
     the route callback never throws on malformed `props`; registration failure returns a safe
     no-op disposer.

10. **Delete the obsolete surface.** Remove `isSuppressedAchievementPlayBar`, `injectOnSeek`,
    and the renderFunc/`findInReactTree`/`findModuleExport`/CSS-class machinery from
    `src/achievementBar.tsx`. Rewrite `src/achievementBar.test.tsx` from scratch to cover the
    units above (the current tests reference removed exports and must not remain).

11. **`src/index.tsx`** — verify it still compiles against the unchanged
    `installAchievementBarPatch()` contract. Change it only if strictly required by the new
    signature (it should not be).

12. **Doc updates (required, keep terse and factual):**
    - `AGENTS.md` → "Decky runtime facts (for the patch)": correct the stale line claiming
      `MiniAchievements.render` is non-configurable / "patch props/parent, not render" — on
      this build `afterPatch(MiniAchievements.prototype, "render", …)` works and is the
      mechanism. Add the capture path (`g_PopupManager` → BPM document → fiber DFS by the
      `onSeek("achievements")` source signature) and the "never tree-descend / `wrapReactClass`
      here (it remounts → store-tabs variant + broken gradient)" warning.
    - `README.md` → the "This plugin restores it the same way…" paragraph: replace the
      "patches the app-details route to feed the PlayBar the `onSeek` prop" description with
      the actual mechanism (patches `MiniAchievements`' own `render` to supply `onSeek` and
      force a re-render; still Valve's component, no reimplementation). One short paragraph.
    - `docs/deep-patch-notes.md` → append a "Final mechanism (supersedes the above)" section:
      the tree-descent / `createReactTreePatcher` plan was rejected because any wrapping
      remounts app-details components (store-tabs + gradient regressions); the shipped fix is
      the prototype-render patch + props getter + out-of-band `forceUpdate`, with class capture
      via `g_PopupManager`. Reference `assets/achievement-bar-restored.png` as the target
      appearance.

Keep all Steam-global and fiber access wrapped and signature-anchored (never key on hashed
CSS classnames or minified locals). Match `MiniAchievements` only by the `onSeek("achievements")`
render-source signature and the seek controller only by the presence of a `SeekToSection`
method — both are stable across Steam updates; hashed names are not.

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

Automated (must pass before marking the round complete; `run-quality-gates` covers the
project gates):

```bash
npm install            # or pnpm install
npm test               # vitest run — all achievementBar unit tests green
npx tsc --noEmit       # typecheck clean
npm run build          # rollup -> dist/index.js, no errors
scripts/orchestration/run-quality-gates
```

Expected: every new unit test passes; typecheck and build succeed; `dist/index.js` is
produced; no references to `createReactTreePatcher` / `wrapReactClass` / `findInReactTree` /
`findModuleExport` / `SP_REACT` remain in `src/achievementBar.tsx`; `grep -R
"isSuppressedAchievementPlayBar\|injectOnSeek" src` returns nothing.

**Deferred — on-device smoke test (human-gated; do NOT block the round on it, and do not
attempt to install to the Deck yourself).** After `dev` integration, a human installs the
built plugin on the Steam Deck and confirms, on a game with achievements (e.g. Brotato):
- the "ACHIEVEMENTS n/total" bar renders inline next to Play Time with live data and the blue
  progress ribbon (matches `assets/achievement-bar-restored.png`);
- the surrounding layout is native-clean — 2 action icons + "STEAM CLOUD" line, correct
  play-row gradient, **no** DLC/Community Hub/Points Shop/Discussions store-tabs strip;
- navigating away and back keeps the bar; the Steam UI never crashes or white-screens;
- disabling the plugin (or dismount) removes the patch cleanly.

Note this deferred on-device step explicitly in the session log when marking the round
complete.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished achievement-bar-prototype-patch
```

This writes:

```text
/tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer achievement-bar-prototype-patch`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/achievement-bar-prototype-patch-review-*.md
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
   scripts/orchestration/clear-finished achievement-bar-prototype-patch
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
   git add docs/review/achievement-bar-prototype-patch-review-*.md
   git commit -m "docs(review): record achievement-bar-prototype-patch review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished achievement-bar-prototype-patch
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer achievement-bar-prototype-patch` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed achievement-bar-prototype-patch
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize achievement-bar-prototype-patch
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finalized
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
scripts/orchestration/finalize achievement-bar-prototype-patch
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finished
/tmp/Decky-SteamAchievements/achievement-bar-prototype-patch_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
