// Restore Valve's removed achievement progress bar on the app-details page.
//
// Research summary (see ../HANDOFF.md and ../research/diffs/removal_onSeek_guard.md):
//   * The bar is Valve's own `MiniAchievements` component, rendered inside the
//     app-details PlayBar (`GameStatsSection`) — "ACHIEVEMENTS n/total" + bar,
//     blue ribbon at 100%.
//   * It was NOT deleted. In Steam CL 10546225 (~2026-03-24) Valve added one
//     guard to MiniAchievements.render():  `if (!this.props.onSeek) return null;`
//   * The Steam Deck game-details header renders its PlayBar with
//     `onSeek: void 0`, so the guard now hides the bar. Supplying a real onSeek
//     makes Valve's own component render again with live data — verified live by
//     injecting onSeek into the running instance (assets/achievement-bar-restored.png).
//
// Strategy: patch the app-details route so the PlayBar receives an onSeek. We do
// NOT reimplement the bar — we only feed the prop Valve withheld.

import { routerHook } from "@decky/api";
import { findInReactTree } from "@decky/ui";
import * as log from "./log";

const APP_ROUTE = "/library/app/:appid";

// The PlayBar / GameStatsSection element passes `onSeek` down to MiniAchievements.
// Match the element that owns onSeek/details/overview but has onSeek unset.
function isSuppressedPlayBar(node: any): boolean {
  const p = node?.props;
  return !!p && "onSeek" in p && "details" in p && "overview" in p && p.onSeek == null;
}

/**
 * Install the route patch. Returns an unpatch function.
 *
 * NOTE: this is the research-backed starting point. The exact tree shape and the
 * real "seek to achievements" handler should be confirmed on-device (CEF) before
 * release — see HANDOFF.md §runtime facts (contexts, store R(78057).H, mobx).
 */
export function installAchievementBarPatch(): () => void {
  log.info("patch", "installing achievement bar restore patch");

  const patch = routerHook.addPatch(APP_ROUTE, (props: any) => {
    try {
      const target = findInReactTree(props?.children, isSuppressedPlayBar);
      if (target) {
        // Supplying onSeek flips MiniAchievements' `if (!this.props.onSeek) return null`.
        // A no-op keeps the bar visible; replace with the page's real section-seek
        // handler once located to restore click-to-achievements behavior.
        target.props.onSeek = (section: string) => {
          log.debug("patch", "achievement stat activated", section);
        };
      } else {
        log.debug("patch", "no suppressed PlayBar found in route tree");
      }
    } catch (e) {
      log.warn("patch", "achievement bar patch failed", e);
    }
    return props;
  });

  return () => {
    try {
      routerHook.removePatch(APP_ROUTE, patch);
      log.info("patch", "achievement bar patch removed");
    } catch (e) {
      log.warn("patch", "removePatch failed", e);
    }
  };
}
