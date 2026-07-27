import { Field, PanelSection, PanelSectionRow } from "@decky/ui";
import type { Versions } from "../backend";

const display = (value: string) => value.trim() || "Unknown";

export function VersionsSection({ versions }: { versions: Versions }) {
  const entries = [
    ["Plugin", versions.plugin],
    ["Decky Loader", versions.decky],
    ["SteamOS", versions.steamos],
  ];
  return (
    <PanelSection title="Versions">
      {entries.map(([label, value]) => (
        <PanelSectionRow key={label}>
          <Field
            label={label}
            focusable={true}
            highlightOnFocus={true}
            bottomSeparator="none"
          >
            <span>{display(value)}</span>
          </Field>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}
