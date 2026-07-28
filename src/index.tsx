import { definePlugin, toaster } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import {
  getSettings,
  getUpdateCheckContextCall,
  getVersions,
  setAutomaticUpdateChecksCall,
  setDebugLogging,
  setFeatureEnabled,
  setUpdateChannelCall,
  checkForPluginUpdateCall,
  markUpdateNotifiedCall,
  type PluginSettings,
  type Versions,
} from "./backend";
import { installAchievementBarPatch } from "./achievementBar";
import { PluginPanelContent } from "./components/PluginPanelContent";
import {
  resetDescriptionScroll,
} from "./components/DescriptionSection";
import { AchievementFeatureController } from "./featureController";
import { SettingsCoordinator } from "./settingsCoordinator";
import { createUpdatePoller } from "./runtime/updatePoller";
import * as log from "./log";

const PLUGIN_NAME = "Achievements Restored";
const QAM_TITLE = "Achievements Restored";
const DEFAULT_SETTINGS: PluginSettings = {
  feature_enabled: true,
  debug_logging: false,
  update_channel: "stable",
  automatic_update_checks: true,
};
const EMPTY_VERSIONS: Versions = { plugin: "", decky: "", steamos: "" };

function Content({ coordinator }: { coordinator: SettingsCoordinator }) {
  const [runtime, setRuntime] = useState(coordinator.snapshot);
  const [versions, setVersions] = useState(EMPTY_VERSIONS);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const {
    settings,
    loaded: settingsLoaded,
    featureBusy,
    debugBusy,
    updateChannelBusy,
    automaticChecksBusy,
  } = runtime;

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
          resetDescriptionScroll(description);
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

  const confirmInstalledPluginVersion = (version: string) => {
    setVersions((current) => ({ ...current, plugin: version }));
  };

  return (
    <PluginPanelContent
      descriptionRef={descriptionRef}
      settings={settings}
      settingsLoaded={settingsLoaded}
      featureBusy={featureBusy}
      debugBusy={debugBusy}
      updateChannelBusy={updateChannelBusy}
      automaticChecksBusy={automaticChecksBusy}
      versions={versions}
      onFeatureChange={(enabled) => void saveFeature(enabled)}
      onDebugChange={(enabled) => void saveDebug(enabled)}
      onUpdateChannelChange={(channel) => void coordinator.setUpdateChannel(channel)}
      onAutomaticChecksChange={(enabled) =>
        void coordinator.setAutomaticUpdateChecks(enabled)
      }
      onInstallVersionConfirmed={confirmInstalledPluginVersion}
    />
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
    setUpdateChannel: setUpdateChannelCall,
    setAutomaticUpdateChecks: setAutomaticUpdateChecksCall,
    setVerboseLogging: log.setVerboseLogging,
    onError(operation, error) {
      log.warn("settings", `${operation} setting operation failed`, error);
    },
  });
  coordinator.start();
  const updatePoller = createUpdatePoller({
    getUpdateCheckContext: getUpdateCheckContextCall,
    checkForUpdate: checkForPluginUpdateCall,
    markUpdateNotified: markUpdateNotifiedCall,
    notify(title, body) {
      toaster.toast({ title, body, duration: 5000 });
    },
    log(level, message) {
      if (level === "warning") log.warn("updater-poller", message);
      else if (level === "error") log.error("updater-poller", message);
      else if (level === "debug") log.debug("updater-poller", message);
      else log.info("updater-poller", message);
    },
  });
  updatePoller.start();

  return {
    name: PLUGIN_NAME,
    titleView: <div className={staticClasses.Title}>{QAM_TITLE}</div>,
    content: <Content coordinator={coordinator} />,
    icon: <FaTrophy />,
    onDismount() {
      updatePoller.dispose();
      coordinator.dispose();
    },
  };
});
