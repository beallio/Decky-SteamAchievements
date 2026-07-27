import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  Field: "Field",
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: 7 },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  ToggleField: "ToggleField",
}));

import { FocusablePanel } from "./FocusablePanel";
import { SettingsSection } from "./SettingsSection";
import { VersionsSection } from "./VersionsSection";

function collect(node: any, type: string, found: any[] = []): any[] {
  if (node == null || typeof node === "boolean") return found;
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, type, found));
    return found;
  }
  if (typeof node !== "object") return found;
  if (node.type === type) found.push(node);
  collect(node.props?.children, type, found);
  return found;
}

describe("focusable QAM sections", () => {
  it("renders two independently focusable settings with concise copy", () => {
    const tree = SettingsSection({
      featureEnabled: true,
      debugLogging: false,
      settingsLoaded: true,
      featureBusy: false,
      debugBusy: false,
      onFeatureChange: vi.fn(),
      onDebugChange: vi.fn(),
    });
    const toggles = collect(tree, "ToggleField");
    expect(toggles.map((entry) => entry.props.label)).toEqual([
      "Achievement bar",
      "Debug logging",
    ]);
    expect(toggles.every((entry) => entry.props.highlightOnFocus === true)).toBe(true);
    const copy = toggles
      .flatMap((entry) => [entry.props.label, entry.props.description])
      .join(" ")
      .toLowerCase();
    expect(copy).not.toContain("trace");
  });

  it("renders three independently focusable version rows with fallbacks", () => {
    const tree = VersionsSection({
      versions: { plugin: "  ", decky: "v3.2.6", steamos: "3.8.1" },
    });
    const fields = collect(tree, "Field");
    expect(fields.map((entry) => entry.props.label)).toEqual([
      "Plugin",
      "Decky Loader",
      "SteamOS",
    ]);
    expect(fields.every((entry) => entry.props.focusable === true)).toBe(true);
    expect(fields.every((entry) => entry.props.highlightOnFocus === true)).toBe(true);
    expect(fields[0].props.children.props.children).toBe("Unknown");
  });

  it("wraps content in a preferred focus navigation group", () => {
    const tree = FocusablePanel({ children: "content" });
    expect(tree.type).toBe("Focusable");
    expect(tree.props.preferredFocus).toBe(true);
    expect(tree.props["flow-children"]).toBe("down");
  });
});
