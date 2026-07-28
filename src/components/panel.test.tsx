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
import { DescriptionSection } from "./DescriptionSection";
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
  it("starts at the restored description without a focus highlight", () => {
    const tree = DescriptionSection({});
    const fields = collect(tree, "Field");

    expect(tree.props.title).toBeUndefined();
    expect(fields).toHaveLength(1);
    expect(fields[0].props.focusable).toBe(true);
    expect(fields[0].props.preferredFocus).toBe(true);
    expect(fields[0].props.highlightOnFocus).toBe(false);
    expect(fields[0].props.onActivate).toEqual(expect.any(Function));
    expect(fields[0].props.onFocus).toEqual(expect.any(Function));
    expect(fields[0].props.childrenLayout).toBe("below");
    expect(fields[0].props.childrenContainerWidth).toBe("max");
    expect(JSON.stringify(fields[0].props.children)).toContain(
      "Restores the achievement progress bar",
    );
    expect(JSON.stringify(fields[0].props.children)).not.toContain("Active.");
  });

  it("resets the outer QAM scroller after Steam's focus scroll settles", () => {
    const tree = DescriptionSection({});
    const field = collect(tree, "Field")[0];
    let onScrollEnd: (() => void) | undefined;
    const scroller = {
      parentElement: null,
      scrollTop: 140,
      scrollHeight: 640,
      clientHeight: 440,
      addEventListener: vi.fn((name: string, callback: () => void) => {
        if (name === "scrollend") onScrollEnd = callback;
      }),
      removeEventListener: vi.fn(),
      scrollTo: vi.fn((_left: number, top: number) => {
        scroller.scrollTop = top;
      }),
    };
    const currentTarget = {
      parentElement: scroller,
      scrollIntoView: vi.fn(),
    };

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("setTimeout", vi.fn(() => 9));
    vi.stubGlobal("clearTimeout", vi.fn());
    vi.stubGlobal("getComputedStyle", (element: unknown) => ({
      overflowY: element === scroller ? "auto" : "visible",
    }));

    field.props.onFocus({ currentTarget });

    expect(scroller.addEventListener).toHaveBeenCalledWith(
      "scrollend",
      expect.any(Function),
      { once: true },
    );
    expect(scroller.scrollTop).toBe(140);
    onScrollEnd?.();
    expect(scroller.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scroller.scrollTop).toBe(0);
    expect(currentTarget.scrollIntoView).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

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
    const styles = collect(tree, "style");
    expect(fields.map((entry) => entry.props.label.props.children)).toEqual([
      "Plugin",
      "Decky Loader",
      "SteamOS",
    ]);
    expect(fields.every((entry) => entry.props.focusable === true)).toBe(true);
    expect(fields.every((entry) => entry.props.highlightOnFocus === true)).toBe(true);
    expect(fields.every((entry) => entry.props.padding === "standard")).toBe(true);
    expect(
      fields.every(
        (entry) => entry.props.className === "decky-steamachievements-version-row",
      ),
    ).toBe(true);
    expect(styles[0].props.children).toContain("padding-top: 4px");
    expect(styles[0].props.children).toContain("padding-bottom: 4px");
    expect(
      fields.every(
        (entry) =>
          entry.props.label.props.style.fontSize === "0.8rem" &&
          entry.props.children.props.style.fontSize === "0.8rem",
      ),
    ).toBe(true);
    expect(fields[0].props.children.props.children).toBe("Unknown");
  });

  it("wraps content in a preferred focus navigation group", () => {
    const tree = FocusablePanel({ children: "content" });
    expect(tree.type).toBe("Focusable");
    expect(tree.props.preferredFocus).toBe(true);
    expect(tree.props["flow-children"]).toBe("down");
  });
});
