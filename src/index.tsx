import { definePlugin } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { useEffect, useState } from "react";
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
import { AchievementFeatureController } from "./featureController";
import * as log from "./log";

const PLUGIN_NAME = "Achievements Restored";
const DEFAULT_SETTINGS: PluginSettings = {
  feature_enabled: true,
  debug_logging: false,
};
const EMPTY_VERSIONS: Versions = { plugin: "", decky: "", steamos: "" };

function Content({
  controller,
  initialSettings,
}: {
  controller: AchievementFeatureController;
  initialSettings: Promise<PluginSettings>;
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [versions, setVersions] = useState(EMPTY_VERSIONS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [featureBusy, setFeatureBusy] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void initialSettings.then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        log.setVerboseLogging(loaded.debug_logging);
        setSettingsLoaded(true);
      });
    void getVersions()
      .then((loaded) => {
        if (!cancelled) setVersions(loaded);
      })
      .catch((error) => log.warn("versions", "version load failed", error));
    return () => {
      cancelled = true;
    };
  }, [initialSettings]);

  const saveFeature = async (enabled: boolean) => {
    if (featureBusy) return;
    const previous = settings;
    if (!controller.setEnabled(enabled)) return;
    setFeatureBusy(true);
    setSettings({ ...settings, feature_enabled: enabled });
    try {
      const saved = await setFeatureEnabled(enabled);
      setSettings(saved);
      controller.setEnabled(saved.feature_enabled);
      log.setVerboseLogging(saved.debug_logging);
    } catch (error) {
      setSettings(previous);
      controller.setEnabled(previous.feature_enabled);
      log.warn("settings", "feature setting save failed", error);
    } finally {
      setFeatureBusy(false);
    }
  };

  const saveDebug = async (enabled: boolean) => {
    if (debugBusy) return;
    const previous = settings;
    setDebugBusy(true);
    setSettings({ ...settings, debug_logging: enabled });
    log.setVerboseLogging(enabled);
    try {
      const saved = await setDebugLogging(enabled);
      setSettings(saved);
      log.setVerboseLogging(saved.debug_logging);
      controller.setEnabled(saved.feature_enabled);
    } catch (error) {
      setSettings(previous);
      log.setVerboseLogging(previous.debug_logging);
      log.warn("settings", "debug setting save failed", error);
    } finally {
      setDebugBusy(false);
    }
  };

  return (
    <FocusablePanel>
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
  let active = true;
  const controller = new AchievementFeatureController(
    installAchievementBarPatch,
    (error) => log.error("plugin", "achievement patch lifecycle failed", error),
  );
  const initialSettings = getSettings().catch((error) => {
    log.warn("settings", "settings load failed; using defaults", error);
    return DEFAULT_SETTINGS;
  });
  void initialSettings.then((loaded) => {
    if (!active) return;
    log.setVerboseLogging(loaded.debug_logging);
    controller.setEnabled(loaded.feature_enabled);
  });

  return {
    name: PLUGIN_NAME,
    titleView: <div className={staticClasses.Title}>{PLUGIN_NAME}</div>,
    content: (
      <Content controller={controller} initialSettings={initialSettings} />
    ),
    icon: <FaTrophy />,
    onDismount() {
      active = false;
      controller.dispose();
    },
  };
});
