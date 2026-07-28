# Plan: Recover the Removed Steam Big Picture / Steam Deck Achievement Bar Implementation

## Objective

Reverse-engineer the achievement progress bar Valve displayed beside the Play button on the modern Steam Deck / Big Picture game-details page before its removal around April 30, 2026.

The investigation must determine, as far as the available artifacts permit:

- The exact React/Webpack component that rendered the achievement bar.
- Valve's original component/function names where recoverable.
- The component's JSX/render structure.
- Its CSS classes and styling.
- Where it was inserted into the game-details React tree.
- Which achievement data/store/API it consumed.
- How progress, completion state, and the 100% completion ribbon were calculated/rendered.
- What exactly changed when Valve removed it.
- Enough implementation detail to recreate the feature in a Decky/SteamUI plugin.

Do not invent names. Clearly distinguish:

1. Names proven to originate from Valve.
2. Names inferred from source maps/CSS/runtime metadata.
3. Analyst-assigned names used only for readability.

---

## Background

This is the **modern Steam Deck/Gamepad UI**, not the legacy `tenfoot` Big Picture interface.

The removed UI looked approximately like:

```text
ACHIEVEMENTS
0/44
──────────────
```

It appeared in the game-details hero/action area near the Play button. At 100% completion, the UI reportedly displayed an additional blue completion/ribbon indicator.

Achievement functionality itself was not removed; achievements remain accessible elsewhere in SteamUI. The task is specifically to recover the removed game-details summary component.

SteamTracking archives extracted Steam client web assets and should be treated as the primary historical source.

Candidate historical commits currently believed to bracket the removal:

```text
Pre-removal:
701ecca79ccf8b8ab635ca43fbe68eb36d11484a

Removal/update:
79adf888dd8e2de5e83fe7afed1d21810a2b65cf
```

Verify that these are actually the closest useful pre/post snapshots before relying on them.

Likely relevant SteamTracking paths include:

```text
ClientExtracted/steamui/chunk~2dcc5aaf7.js
ClientExtracted/steamui/css/chunk~2dcc5aaf7.css
ClientExtracted/steamui/library.js
ClientExtracted/steamui/libraries/
ClientExtracted/steamui/localization/steamui_english.json
ClientManifest/steam_client_ubuntu12
```

Known useful localization anchors include:

```text
AppDetails_SectionTitle_Achievements
AppDetails_ViewAllAchievements
AppDetails_PlayerUnlockedPercent
AppDetails_PlayerUnlockedPercentAll
```

These strings are anchors, not proof that the same module renders the top-bar component.

---

## Phase 1 — Acquire Exact Historical Artifacts

Create a working directory:

```text
research/
  pre/
  post/
  websrc/
  extracted/
  reports/
  scripts/
```

Retrieve the relevant SteamTracking repository or individual Git blobs.

Prefer Git over GitHub's web viewer:

```bash
git clone https://github.com/SteamTracking/SteamTracking.git
```

or use a partial repository plus:

```bash
git show <commit>:<path>
```

Extract at minimum from both pre- and post-removal commits:

```text
chunk~2dcc5aaf7.js
chunk~2dcc5aaf7.css
library.js
steamui_english.json
```

Preserve the original files byte-for-byte.

Record:

```text
commit
filename
size
SHA-256
Git blob ID
```

before modifying/formatting anything.

Also inspect historical client manifests for:

```text
steamui_websrc_all.zip.<hash>
```

Download all relevant pre/post `steamui_websrc_all` archives directly from Valve's Steam client CDN when still available.

Do not assume a package belongs to the pre-removal build merely because it occurs in the nearest Git commit. Verify manifest/package relationships.

---

## Phase 2 — Search for Original Source / Source Maps First

Before manually deminifying anything, inspect every acquired artifact for:

```text
*.map
*.js.map
*.ts
*.tsx
*.jsx
*.scss
webpack://
sourceMappingURL
sourcesContent
```

Check both:

1. SteamTracking files.
2. `steamui_websrc_all` contents.

For JavaScript bundles:

```bash
grep -aoE 'sourceMappingURL=[^[:space:]]+' chunk.js
```

Also test for hidden source maps. Absence of `sourceMappingURL` does not prove a map was never generated.

If a source map exists, inspect:

```json
sources
sourcesContent
names
sourceRoot
file
```

Highest priority result:

```text
sourcesContent != null
```

If present, extract every embedded source file while preserving the source-map path hierarchy.

Search recovered source for:

```text
achievement
achievements
AppDetails
PlayerUnlocked
progress
perfect
completed
ribbon
```

If original `.tsx`/`.ts` source is recovered, use that as the authoritative implementation instead of reverse-engineering the minified bundle.

---

## Phase 3 — Establish the Removal Diff

Determine exactly which SteamTracking commit first removes the visible component.

Do not assume the currently identified April 30 commit without testing nearby revisions.

Use Git history on:

```text
ClientExtracted/steamui/
```

and compare several commits immediately before/after the suspected removal.

Look for changes involving:

```text
game details
AppDetails
achievement
header
hero
action row
library
```

Generate machine-readable diffs for relevant JS and CSS assets.

Because minification can cause widespread bundle churn, do not treat a whole-file textual diff as authoritative. Compare at the Webpack module/AST level once modules are identified.

Output:

```text
last-known-present commit
first-known-absent commit
Steam client changelist/build, if identifiable
affected bundle/module IDs
```

---

## Phase 4 — Locate the Pre-Removal Achievement Component

Search the pre-removal bundle for the localization anchors.

Because bundles may consist of extremely long lines, find byte offsets programmatically and dump approximately 10–50 KB around every occurrence.

Search additionally for strings containing:

```text
achievement
Achievements
unlocked
perfect
completion
progress
```

Identify the surrounding Webpack module.

Typical goal:

```text
webpack chunk
  └── module <ID>
       └── function/component containing achievement render logic
```

Extract the entire module into an independent file.

Record:

```text
chunk ID
module ID
exports
imports/requires
localization calls
CSS module imports
React hooks
data/store dependencies
navigation callbacks
```

Do not assign semantic names yet except temporary identifiers such as:

```text
Module_12345
Component_A
Hook_B
```

---

## Phase 5 — Recover Valve-Originated Names

Attempt name recovery in this order.

### A. Source maps

Use:

```text
sources
sourcesContent
names
```

These provide the strongest evidence of original filenames and identifiers.

### B. Original/unminified web source

Search `steamui_websrc_all` for matching source code.

### C. React metadata

Search for:

```text
displayName
name
prototype
componentName
```

Determine whether the component name survives runtime reflection.

### D. Webpack export names

Inspect named exports and re-export tables.

Names preserved as object properties may survive even when local variables are mangled.

### E. CSS Modules

Follow the component's imported CSS module.

CSS-module property names often survive minification, e.g.:

```text
AchievementProgress
AchievementCount
AchievementBar
AchievementBarFill
PerfectGame
```

Any actual names found must be recorded verbatim.

### F. Localization identifiers

Use these only to infer semantics, not JavaScript function names.

### G. Debug/logging strings

Search for component-specific logging, assertions, analytics events, accessibility strings, or telemetry names.

---

## Phase 6 — Reconstruct the Component Dependency Graph

Follow every meaningful import/require from the achievement component.

Identify:

```text
Game-details parent component
    ↓
Achievement summary component
    ↓
Achievement progress data selector/hook
    ↓
Achievement/application store
    ↓
Steam client API/cache
```

Determine:

- Where `appid` comes from.
- Where total achievement count comes from.
- Where unlocked achievement count comes from.
- Whether hidden achievements affect the total.
- Whether achievement data is cached or asynchronously requested.
- What happens before data loads.
- Conditions that suppress the component.
- Whether non-Steam games are excluded.
- Whether games with zero achievements are excluded.
- Whether achievement progress is account-specific.

Locate any existing SteamUI hooks/selectors involved.

Document actual function/module names where recoverable.

---

## Phase 7 — Recover the Render Structure

Reconstruct the pre-removal React subtree.

Determine:

- Parent container.
- Exact insertion/order relative to Play/Install and other metadata.
- Wrapper element type.
- Focusable/button behavior.
- Controller navigation behavior.
- Heading.
- Completed/total count.
- Progress track.
- Progress fill.
- Completion ribbon/icon.
- Click/activation behavior.
- Destination route when selected.
- Responsive/compact layout behavior.

Produce readable pseudocode/TSX, but label reconstructed code as such unless original source has been recovered.

Example:

```tsx
// RECONSTRUCTED — not Valve's original source

<AchievementSummary>
    ...
</AchievementSummary>
```

If actual original source is recovered, label it clearly:

```text
RECOVERED ORIGINAL SOURCE
```

---

## Phase 8 — Recover CSS

Identify the CSS module used by the component.

Extract every relevant rule and dependency.

Record:

```text
Valve class/property name
compiled/hash class
selector
dimensions
padding/margin
font properties
opacity
progress-track dimensions
fill color
100%-completion treatment
hover/focus styles
animations/transitions
responsive rules
```

Compare pre/post CSS.

Determine whether Valve:

1. Deleted the styles.
2. Left styles orphaned.
3. Reused them elsewhere.
4. Replaced the component with another layout.

Screenshots may be used to validate interpretation but should not override source evidence.

---

## Phase 9 — Analyze the Removal

Compare the identified pre-removal module to the first post-removal equivalent.

Answer precisely:

- Was the component definition deleted?
- Was only its parent invocation deleted?
- Was a feature flag changed?
- Was the entire action-row component redesigned?
- Did the achievement component survive elsewhere?
- Were its CSS rules deleted?
- Were underlying data selectors preserved?
- Were navigation routes preserved?

This distinction matters because restoration may be as simple as reinserting an existing component or may require recreating the component.

Produce a minimal semantic diff such as:

```diff
<AppDetailsHeader>
    <PlayAction />
-   <AchievementSummary ... />
    <Playtime ... />
</AppDetailsHeader>
```

Do not use this example unless supported by the actual investigation.

---

## Phase 10 — Determine Modern Restoration Strategy

Compare the historical implementation with current SteamUI.

Identify the modern equivalent of the historical parent container.

Known modern Decky/SteamUI research indicates the game-details page contains an `InnerContainer`-type node and can be patched through the React route renderer, but verify this against the current client.

Determine the safest recreation strategy:

### Preferred

Reuse Valve's existing achievement data hooks/components if they still exist.

### Second choice

Reuse Valve's current achievement store/API and recreate only the removed presentation component.

### Last choice

Fetch/derive achievement data independently.

The restoration should ideally preserve:

```text
controller focus navigation
Deck scaling
Big Picture scaling
Steam themes
gamepad activation
navigation to achievements
loading states
games without achievements
100% completion state
```

Avoid brittle absolute-position overlays if insertion into the native layout is possible.

---

## Required Deliverables

### 1. `REPORT.md`

Include:

- Executive summary.
- Confirmed removal commit/build.
- Historical component location.
- Exact Webpack module IDs.
- Proven Valve-originated names.
- Inferred names separately.
- Dependency/data-flow diagram.
- Render-tree reconstruction.
- CSS reconstruction.
- Pre/post removal analysis.
- Recommended restoration approach.
- Remaining uncertainties.

### 2. `recovered/`

Store any recovered source-map/original files.

### 3. `modules/`

Store cleanly extracted relevant Webpack modules.

Example:

```text
modules/
  pre-achievement-component.js
  post-parent-component.js
  achievement-data-store.js
  achievement-css-module.js
```

### 4. `diffs/`

Include:

```text
semantic-component.diff
css.diff
module-dependency.diff
```

### 5. `RECREATED_COMPONENT.tsx`

Provide a readable reconstruction suitable as a starting point for a Decky implementation.

Every identifier must be classified as:

```text
[VALVE]      Exact Valve-originated name.
[INFERRED]   Strong inference from surrounding metadata.
[ASSIGNED]   Analyst-created readability name.
```

Annotations may instead be documented in an accompanying mapping table if inline annotations make the code unusable.

### 6. `NAME_EVIDENCE.md`

For each claimed original name, record evidence.

Example:

```text
Name: AchievementProgress

Confidence: Proven

Evidence:
- source map `names[312]`
- original source path ...
- mapping points to bundle offset ...

or

Confidence: Inferred

Evidence:
- CSS property `AchievementProgress`
- component consumes achievement progress
- JavaScript function itself was mangled to `x`
```

---

## Acceptance Criteria

The investigation is complete when it can answer all of the following:

1. Which exact historical SteamUI build last contained the achievement bar?
2. Which Webpack module/component rendered it?
3. What Valve-authored names can actually be recovered?
4. What was the parent React tree location?
5. Which data source supplied unlocked/total achievements?
6. How was progress calculated?
7. How was the completed-game state rendered?
8. What happened when the component was activated?
9. Which CSS rules controlled its appearance?
10. What exact code/layout change removed it?
11. Which historical pieces still exist in current SteamUI?
12. What is the least brittle method for recreating it today?

A successful result must not merely reproduce the screenshot visually. It must trace the historical implementation and provide evidence for the recovered architecture.

---

## Important Constraints

- Do not confuse this with legacy `ClientExtracted/tenfoot` Big Picture code.
- Do not claim minifier-generated names are Valve's original names.
- Do not claim analyst-created semantic names are original names.
- Preserve untouched copies of all historical artifacts.
- Work from exact commits/builds and record hashes.
- Prefer source maps/original source over deminification.
- Prefer module-level/AST diffs over whole-bundle formatted diffs.
- Treat localization/CSS names as evidence, not automatic proof of JavaScript identifiers.
- Document uncertainty explicitly.
- Do not modify a live Steam installation during the research phase.
