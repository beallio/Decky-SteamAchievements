# Deep-patch notes — why the route patch fails, and the real fix

On-device findings (Steam Deck, Gaming Mode / gamescope, CL 10840511) from the
device smoke test of the first `feat/achievement-bar-patch` build. These supersede
the single-level route-patch assumption in the plan.

## Why the shipped approach doesn't work

The plugin's `routerHook.addPatch("/library/app/:appid")` fires and its `afterPatch`
on `children.props.renderFunc` runs — but `renderFunc`'s output is **too shallow**.
A strict element search of that output finds **0** elements carrying
`{onSeek, details, overview}`. The PlayBar / `MiniAchievements` elements are created
by components **several mobx-observer boundaries below** the route render, so a
single-level route patch can never reach them. (Confirmed live: injected into the
one loose match → bar still absent; strict search → 0 matches.)

## The live component chain (fiber walk, GameStatsSection → up/down)

```
route renderFunc
  → … wrappers …
  → le   [class, has SeekToSection]        // app-details content/header; owns the seek handler
  → (focus/flow wrappers: FocusableBy, g "flow-children", …)
  → Qe   [class] GameStatsSection          // the PlayBar stat row; renders MiniAchievements unconditionally
       → We [PlayBar/GameStat]  (playtime)
       → Ie [class] MiniAchievements       // render: GetAchievements(appid); guard `if(!this.props.onSeek) return null`
       → je [PlayBar/GameStat]
```

`Ie` (MiniAchievements) receives `onSeek` from `Qe` (`onSeek={this.props.onSeek}`);
`Qe` gets it from the PlayBar, which the Deck header renders with `onSeek: void 0`.
All of `le/Qe/Ie` are **mobx `observer`** classes — you cannot reliably reassign
their `render` (mobx holds the original), so prototype patching is out.

## Proven mechanism

Injecting `onSeek` into the live `Ie` instance's `props` (+ forceUpdate) makes the
bar render with live data (the earlier screenshot). So the fix is purely "supply
`onSeek`"; the challenge is doing it durably at render time across mobx boundaries.

## The correct fix (tools confirmed present)

`window.DFL` (@decky/ui) exposes: `createReactTreePatcher`, `wrapReactType`,
`afterPatch`, `beforePatch`, `findInReactTree`, `findModuleChild`, `findModuleExport`,
`wrapReactClass`, `replacePatch`. `wrapReactType` clones an element's `type`
(`{...type, __DECKY_WRAPPED:true}`) so wrapping is **instance-local and mobx-safe**.

Use **`createReactTreePatcher(steps, handler, debugName)`** on the app route:
- `steps`: an ordered list of finder functions, one per component boundary, drilling
  route → `le` → … → `Qe`. Each finder returns the node whose render to descend into.
- `handler`: given `Qe`'s rendered output, `findInReactTree` for the `Ie`
  (`MiniAchievements`) element — the node whose `type` source contains
  `onSeek("achievements")`, or with `{onSeek:null, details, overview}` — and set its
  `onSeek` to a handler (no-op is fine for v1). Return the tree.

`Ie`/`Qe` are NOT reachable via `findModuleExport` (module-internal locals) — they can
only be reached by drilling the render tree as above. Match components by the
`onSeek("achievements")` source signature and CSS-module keys (`MiniAchievements`,
`GameStatsSection`), never hashed classnames/minified ids.

## Open work

Build the `createReactTreePatcher` step/finder chain and verify on-device. This needs
a few controlled iterations to pin each boundary's finder (the chain between `le` and
`Qe` includes several focus/flow wrappers). Study `createStepHandler` semantics
(internal to `createReactTreePatcher`) or mirror an existing app-details deep-patch
plugin (e.g. SteamGridDB) for the exact finder shape.

## Final mechanism (supersedes the above)

The tree-descent / `createReactTreePatcher` approach was rejected after live
testing: wrapping any component in the app-details subtree remounts Steam's
content components, exposes the store-tabs variant, and breaks the play-row
gradient.

The shipped fix captures `MiniAchievements` read-only through
`g_PopupManager` → Big Picture document → fiber DFS, then `afterPatch`es its
prototype `render`. On the first intercepted render it installs a persistent
`props` getter that supplies `onSeek` and schedules an out-of-band
`forceUpdate()`. This restores Valve's component without a remount or CSS
changes; [`assets/achievement-bar-restored.png`](../assets/achievement-bar-restored.png)
is the target appearance.

## Final trigger lifecycle

The first capture-timing implementation still failed when the plugin loaded away
from app details. It treated the callback passed to `routerHook.addPatch()` as a
per-navigation callback, but Decky invokes it while transforming the route table.
Its single deferred capture could miss `MiniAchievements` and then remain idle
when a game was opened later.

The route's `children.props.renderFunc` after-patch is retained only as a signal:
it returns the rendered tree untouched and schedules a short, bounded capture
burst after the render. The output remains too shallow for component searching.
Future app-details renders can start a new burst, while successful prototype
capture stops all further scans. No tree descent, component wrapping, remount, or
permanent background poll is involved.
