import { Field, PanelSection, PanelSectionRow } from "@decky/ui";
import type { FocusEvent, Ref } from "react";

const revealOnFocus = {
  // Decky's Field forwards DOM focus props even though its public type omits them.
  onFocus: (event: FocusEvent<HTMLDivElement>) => {
    event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
};

export function DescriptionSection({ focusRef }: { focusRef?: Ref<HTMLDivElement> }) {
  return (
    <PanelSection>
      <PanelSectionRow>
        <Field
          ref={focusRef}
          {...revealOnFocus}
          focusable={true}
          highlightOnFocus={false}
          preferredFocus={true}
          onActivate={() => undefined}
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
