import { Field, PanelSection, PanelSectionRow } from "@decky/ui";
import type { Versions } from "../backend";

const display = (value: string) => value.trim() || "Unknown";
const versionTextStyle = { fontSize: "0.8rem" } as const;
const versionRowCss = `
  .decky-steamachievements-version-row {
    padding-top: 4px !important;
    padding-bottom: 4px !important;
  }
`;

export function VersionsSection({ versions }: { versions: Versions }) {
  const entries = [
    ["Plugin", versions.plugin],
    ["Decky Loader", versions.decky],
    ["SteamOS", versions.steamos],
  ];
  return (
    <PanelSection title="Versions">
      <style>{versionRowCss}</style>
      {entries.map(([label, value]) => (
        <PanelSectionRow key={label}>
          <Field
            label={<span style={versionTextStyle}>{label}</span>}
            focusable={true}
            highlightOnFocus={true}
            bottomSeparator="none"
            padding="standard"
            className="decky-steamachievements-version-row"
          >
            <span style={versionTextStyle}>{display(value)}</span>
          </Field>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}
