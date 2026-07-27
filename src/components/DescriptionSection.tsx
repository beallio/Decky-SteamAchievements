import { Field, PanelSection, PanelSectionRow } from "@decky/ui";
import type { Ref } from "react";

export function DescriptionSection({ focusRef }: { focusRef?: Ref<HTMLDivElement> }) {
  return (
    <PanelSection>
      <PanelSectionRow>
        <Field
          ref={focusRef}
          focusable={true}
          highlightOnFocus={false}
          preferredFocus={true}
          childrenLayout="below"
          childrenContainerWidth="max"
          bottomSeparator="none"
          padding="standard"
        >
          <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
            Restores the achievement progress bar on the game details page (next
            to Play Time). Open a game that has achievements to see it.
          </div>
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
}
