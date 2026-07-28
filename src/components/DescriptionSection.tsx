import { Field, PanelSection, PanelSectionRow } from "@decky/ui";
import type { FocusEvent, Ref } from "react";
import * as log from "../log";

export function resetDescriptionScroll(description: HTMLDivElement) {
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
}

const revealOnFocus = {
  // Decky's Field forwards DOM focus props even though its public type omits them.
  onFocus: (event: FocusEvent<HTMLDivElement>) => {
    const description = event.currentTarget;
    requestAnimationFrame(() => {
      try {
        // Run after Steam's own smooth nearest-scroll so the sticky QAM header
        // cannot cover the first line of the description.
        resetDescriptionScroll(description);
      } catch (error) {
        log.debug("focus", "could not reveal QAM description", error);
      }
    });
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
