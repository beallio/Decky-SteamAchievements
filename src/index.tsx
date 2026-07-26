import { definePlugin } from "@decky/api";
import { PanelSection, PanelSectionRow, staticClasses } from "@decky/ui";
import { FaTrophy } from "react-icons/fa6";
import { installAchievementBarPatch } from "./achievementBar";
import * as log from "./log";

const PLUGIN_NAME = "Achievements Restored";

// Minimal QAM panel so the plugin is visibly installed and manageable. The
// actual work is the app-details route patch; there is nothing to configure yet.
function Content() {
  return (
    <PanelSection title="Achievements Restored">
      <PanelSectionRow>
        <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
          Active. Restores the achievement progress bar on the game details page
          (next to Play Time). Open a game that has achievements to see it.
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

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
    content: <Content />,
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
