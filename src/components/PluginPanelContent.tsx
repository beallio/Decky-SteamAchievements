import type { Ref } from "react";
import type { PluginSettings, UpdateChannel, Versions } from "../backend";
import { DescriptionSection } from "./DescriptionSection";
import { FocusablePanel } from "./FocusablePanel";
import { PluginUpdateSection } from "./PluginUpdateSection";
import { SettingsSection } from "./SettingsSection";
import { VersionsSection } from "./VersionsSection";

type Props = {
  descriptionRef: Ref<HTMLDivElement>;
  settings: PluginSettings;
  settingsLoaded: boolean;
  featureBusy: boolean;
  debugBusy: boolean;
  updateChannelBusy: boolean;
  automaticChecksBusy: boolean;
  versions: Versions;
  onFeatureChange: (enabled: boolean) => void;
  onDebugChange: (enabled: boolean) => void;
  onUpdateChannelChange: (channel: UpdateChannel) => void;
  onAutomaticChecksChange: (enabled: boolean) => void;
  onInstallVersionConfirmed: (version: string) => void;
};

export function PluginPanelContent(props: Props) {
  return (
    <FocusablePanel>
      <DescriptionSection focusRef={props.descriptionRef} />
      <SettingsSection
        featureEnabled={props.settings.feature_enabled}
        debugLogging={props.settings.debug_logging}
        settingsLoaded={props.settingsLoaded}
        featureBusy={props.featureBusy}
        debugBusy={props.debugBusy}
        onFeatureChange={props.onFeatureChange}
        onDebugChange={props.onDebugChange}
      />
      <PluginUpdateSection
        currentVersion={props.versions.plugin || "Loading..."}
        updateChannel={props.settings.update_channel}
        automaticUpdateChecks={props.settings.automatic_update_checks}
        settingsLoaded={props.settingsLoaded}
        updateChannelBusy={props.updateChannelBusy}
        automaticChecksBusy={props.automaticChecksBusy}
        onToggleUpdateChannel={(enabled) =>
          props.onUpdateChannelChange(enabled ? "development" : "stable")
        }
        onToggleAutomaticUpdateChecks={props.onAutomaticChecksChange}
        onInstallVersionConfirmed={props.onInstallVersionConfirmed}
      />
      <VersionsSection versions={props.versions} />
    </FocusablePanel>
  );
}

