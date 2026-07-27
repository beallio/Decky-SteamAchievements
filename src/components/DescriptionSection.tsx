import { Field, PanelSection, PanelSectionRow } from "@decky/ui";

export function DescriptionSection() {
  return (
    <PanelSection title="Achievements Restored">
      <PanelSectionRow>
        <Field
          focusable={true}
          highlightOnFocus={false}
          preferredFocus={true}
          bottomSeparator="none"
          padding="standard"
        >
          <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
            Active. Restores the achievement progress bar on the game details page
            (next to Play Time). Open a game that has achievements to see it.
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
