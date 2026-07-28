import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import type { ReactNode } from "react";

export function FocusablePanel({ children }: { children: ReactNode }) {
  return (
    <Focusable
      preferredFocus={true}
      navEntryPreferPosition={NavEntryPositionPreferences.PREFERRED_CHILD}
      flow-children="down"
    >
      {children}
    </Focusable>
  );
}
