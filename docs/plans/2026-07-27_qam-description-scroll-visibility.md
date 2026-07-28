# QAM description scroll visibility fix

Date: 2026-07-27

Branch: `fix/qam-description-scroll-visibility`

## Objective

Keep the introductory description visible when controller focus scrolls from the bottom of the
Achievements Restored QAM panel back to its first row.

## Scope

In scope:

- Reproduce and identify the focus/scroll contract responsible for the missing text.
- Add a regression test for the description row's required layout/focus behavior.
- Make the smallest frontend-only component or style change that restores the text.
- Verify focus navigation and scrolling on a live Steam Deck.

Out of scope:

- Changing plugin identity, settings behavior, version rows, or achievement-bar patching.
- Reimplementing Decky navigation or scrolling.
- Any backend or release-workflow changes.

## Phases and tasks

### 1. Reproduction and root cause

1. Inspect `DescriptionSection`, `FocusablePanel`, and the rendered QAM structure.
2. Reproduce the down-then-up controller navigation on `ssh steamdeck` and inspect the live DOM
   around the description row.
3. Compare the component's props and structure with Decky UI patterns that remain visible after
   focus-driven scrolling.

Output: a concrete explanation of which focus or layout property causes the text to disappear.

Validation: the observed DOM/focus state must distinguish the broken state from initial render.

### 2. Regression test

1. Add a focused component test expressing the required description-row structure or styling.
2. Run the new test before the fix and record its non-zero failure.

Output: a test that fails for the current implementation and passes only with the intended fix.

Validation: the failure must identify the missing property or incorrect structure.

### 3. UI fix

1. Apply the minimal fix in the relevant `src/components` file.
2. Run the targeted test, full frontend suite, typecheck, and production build.

Output: description text remains rendered and visible after reverse navigation.

Validation: targeted and full automated checks pass without changing unrelated UI contracts.

### 4. Live verification and documentation

1. Package and deploy the branch to the Steam Deck without changing the canonical install path.
2. Open the QAM panel, navigate to the bottom, navigate back to the description, and confirm the
   full description is visible.
3. Recheck focus order, settings toggles, version rows, and QAM title.
4. Record evidence in `docs/agent_conversations/`.

Output: durable live-smoke evidence and an atomic conventional commit.

Validation: the live regression path passes, the full repository quality gates pass, and the
worktree is clean after commit.

## Verification commands

```text
npm test -- src/components/panel.test.tsx
npm test
npx tsc --noEmit
npm run build
XDG_CACHE_HOME=/tmp/Decky-SteamAchievements/cache uv run --with pytest -- pytest -q
scripts/orchestration/run-quality-gates
npm run package
python3 scripts/validate_plugin_zip.py Decky-SteamAchievements.zip
git diff --check
```
