# QAM description scroll visibility verification

Date: 2026-07-27

Branch: `fix/qam-description-scroll-visibility`

Final tested build: `0.1.0+a3b49d5`

Device: `steamdeck`

## Symptom and root cause

Moving controller focus from the description to the bottom `SteamOS` row scrolled the outer QAM
container to approximately `140.7px`. Returning focus to the description left the container at
`36px`. The description element was technically inside the scroller bounds, but Decky's sticky
header covered the first line and the QAM title was no longer visible.

Live instrumentation showed Steam performs its final `36px` focus offset hundreds of
milliseconds after the description receives focus. Direct `scrollTop = 0`, a nearest
`scrollIntoView`, and a single animation-frame correction all ran too early. Calling
`scrollTo(0, 0)` cancels an established smooth scroll. The final implementation applies that
correction on `scrollend` and repeats it independently after 500 ms because Steam can emit an
earlier `scrollend` before applying its delayed offset.

## Prove-it-can-fail evidence

- The first regression assertion failed with `onFocus` absent and exit 1; output is saved at
  `/tmp/Decky-SteamAchievements/qam-description-red.log`.
- The sticky-header regression failed when no post-focus frame was scheduled; output is saved at
  `/tmp/Decky-SteamAchievements/qam-description-sticky-header-red.log`.
- The cancellation regression failed because direct assignment never called `scrollTo(0, 0)`;
  output is saved at `/tmp/Decky-SteamAchievements/qam-description-scroll-cancel-red.log`.
- The settlement regression failed because no `scrollend` listener was armed; output is saved at
  `/tmp/Decky-SteamAchievements/qam-description-scrollend-red.log`.
- The late-offset regression simulated an early `scrollend`, then restored Steam's `36px`
  offset. It failed at `expected 0, received 36` until the independent final correction was
  retained; output is saved at
  `/tmp/Decky-SteamAchievements/qam-description-late-offset-red.log`.

## Live acceptance

- The exact local and delivered ZIP both had SHA-256
  `0c23ed63b354df441c2f3cce27da7c11602ef7bbb530e9b1b0ea0ea0e6da59ca`.
- Decky's supported local overwrite flow installed `0.1.0+a3b49d5` once under
  `/home/deck/homebrew/plugins/Decky-SteamAchievements`.
- Settings remained `feature_enabled: true` and `debug_logging: false`; Decky Loader remained
  active.
- After reopening the panel so the newly imported frontend mounted, controller navigation moved
  from the description through both toggles and all three version rows to `SteamOS`, then back.
- At the bottom the outer scroller was approximately `140.7px`. After returning to the
  description and waiting beyond Steam's delayed scroll, it was exactly `0px`.
- Runtime tracing recorded the description's `scrollend` listener, an immediate correction at
  scroll settlement, and the independent 500 ms correction. The final screenshot at
  `/tmp/Decky-SteamAchievements/screenshots/qam-description-a3-reopened-final.png` visibly shows
  the complete `Achievements Restored` title and every description line.

## Repeated settlement check

Ten controller round trips from description to `SteamOS` and back all ended with the description
focused and `scrollTop = 0`. Measured from the final Up input, stable zero-scroll settlement was:

```text
72.7, 75.5, 69.7, 72.9, 80.4, 104.6, 62.9, 66.9, 173.9, 125.4 ms
mean 90.5 ms; min 62.9 ms; max 173.9 ms
```

The measurement output is saved at
`/tmp/Decky-SteamAchievements/qam-settlement-benchmark.json`.
