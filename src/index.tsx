import { definePlugin } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import {
  getSettings,
  getVersions,
  setDebugLogging,
  setFeatureEnabled,
  type PluginSettings,
  type Versions,
} from "./backend";
import { installAchievementBarPatch } from "./achievementBar";
import { SettingsSection } from "./components/SettingsSection";
import { VersionsSection } from "./components/VersionsSection";
import { FocusablePanel } from "./components/FocusablePanel";
import { DescriptionSection } from "./components/DescriptionSection";
import { AchievementFeatureController } from "./featureController";
import { SettingsCoordinator } from "./settingsCoordinator";
import * as log from "./log";

const PLUGIN_NAME = "Decky-SteamAchievements";
const QAM_TITLE = "Achievements Restored";
const DEFAULT_SETTINGS: PluginSettings = {
  feature_enabled: true,
  debug_logging: false,
};
const EMPTY_VERSIONS: Versions = { plugin: "", decky: "", steamos: "" };

function Content({ coordinator }: { coordinator: SettingsCoordinator }) {
  const [runtime, setRuntime] = useState(coordinator.snapshot);
  const [versions, setVersions] = useState(EMPTY_VERSIONS);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const { settings, loaded: settingsLoaded, featureBusy, debugBusy } = runtime;

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        try {
          const description = descriptionRef.current;
          if (!description) return;

          // Decky's outer QAM scroller survives content remounts. Reset only
          // that scroll position; native HTMLElement.focus() bypasses Steam's
          // gamepad navigation state and can make this preferred row unreachable.
          let ancestor = description.parentElement;
          while (ancestor) {
            const overflowY = getComputedStyle(ancestor).overflowY;
            if (
              (overflowY === "auto" || overflowY === "scroll") &&
              ancestor.scrollHeight > ancestor.clientHeight
            ) {
              ancestor.scrollTop = 0;
              return;
            }
            ancestor = ancestor.parentElement;
          }
          description.scrollIntoView({ block: "start", inline: "nearest" });
        } catch (error) {
          log.debug("focus", "could not reset QAM panel focus", error);
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setRuntime);
    return unsubscribe;
  }, [coordinator]);

  useEffect(() => {
    let cancelled = false;
    void getVersions()
      .then((loaded) => {
        if (!cancelled) setVersions(loaded);
      })
      .catch((error) => log.warn("versions", "version load failed", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const saveFeature = async (enabled: boolean) => {
    await coordinator.setFeatureEnabled(enabled);
  };

  const saveDebug = async (enabled: boolean) => {
    await coordinator.setDebugLogging(enabled);
  };

  return (
    <FocusablePanel>
      <DescriptionSection focusRef={descriptionRef} />
      <SettingsSection
        featureEnabled={settings.feature_enabled}
        debugLogging={settings.debug_logging}
        settingsLoaded={settingsLoaded}
        featureBusy={featureBusy}
        debugBusy={debugBusy}
        onFeatureChange={(enabled) => void saveFeature(enabled)}
        onDebugChange={(enabled) => void saveDebug(enabled)}
      />
      <VersionsSection versions={versions} />
    </FocusablePanel>
  );
}

export default definePlugin(() => {
  log.info("plugin", "loaded");
  const controller = new AchievementFeatureController(
    installAchievementBarPatch,
    (error) => log.error("plugin", "achievement patch lifecycle failed", error),
  );
  const coordinator = new SettingsCoordinator({
    controller,
    defaults: DEFAULT_SETTINGS,
    loadSettings: getSettings,
    setFeatureEnabled,
    setDebugLogging,
    setVerboseLogging: log.setVerboseLogging,
    onError(operation, error) {
      log.warn("settings", `${operation} setting operation failed`, error);
    },
  });
  coordinator.start();

  return {
    name: PLUGIN_NAME,
    titleView: <div className={staticClasses.Title}>{QAM_TITLE}</div>,
    content: <Content coordinator={coordinator} />,
    icon: <FaTrophy />,
    onDismount() {
      coordinator.dispose();
    },
  };
});
