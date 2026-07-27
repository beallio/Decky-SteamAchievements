import { PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";

type Props = {
  featureEnabled: boolean;
  debugLogging: boolean;
  settingsLoaded: boolean;
  featureBusy: boolean;
  debugBusy: boolean;
  onFeatureChange: (enabled: boolean) => void;
  onDebugChange: (enabled: boolean) => void;
};

export function SettingsSection(props: Props) {
  return (
    <PanelSection title="Settings">
      <PanelSectionRow>
        <ToggleField
          label="Achievement bar"
          description="Shows achievement progress on game details pages."
          checked={props.featureEnabled}
          disabled={!props.settingsLoaded || props.featureBusy}
          highlightOnFocus={true}
          onChange={props.onFeatureChange}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Debug logging"
          description="Enables verbose logging for troubleshooting."
          checked={props.debugLogging}
          disabled={!props.settingsLoaded || props.debugBusy}
          highlightOnFocus={true}
          onChange={props.onDebugChange}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}
