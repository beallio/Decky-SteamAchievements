import { definePlugin, staticClasses } from "@decky/ui";
import { FaTrophy } from "react-icons/fa6";
import { installAchievementBarPatch } from "./achievementBar";
import * as log from "./log";

const PLUGIN_NAME = "Achievements Restored";

export default definePlugin(() => {
  log.info("plugin", "loaded");

  let unpatch: (() => void) | undefined;
  try {
    unpatch = installAchievementBarPatch();
  } catch (error) {
    log.error("plugin", "installAchievementBarPatch failed", error);
  }

  return {
    // Must match plugin.json "name" so Decky Loader resolves this install.
    name: PLUGIN_NAME,
    titleView: <div className={staticClasses.Title}>{PLUGIN_NAME}</div>,
    icon: <FaTrophy />,
    onDismount() {
      try {
        unpatch?.();
      } catch (error) {
        log.error("plugin", "unpatch failed", error);
      }
    },
  };
});
