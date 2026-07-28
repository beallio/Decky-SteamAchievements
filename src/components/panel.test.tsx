import { describe, expect, it, vi } from "vitest";

vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  Field: "Field",
  Focusable: "Focusable",
  NavEntryPositionPreferences: { PREFERRED_CHILD: 7 },
  Navigation: { NavigateToExternalWeb: vi.fn() },
  PanelSection: "PanelSection",
  PanelSectionRow: "PanelSectionRow",
  showModal: vi.fn(),
  Spinner: "Spinner",
  ToggleField: "ToggleField",
}));

const updateController = vi.hoisted(() => ({
  effectiveCurrentVersion: "0.1.1+local",
  candidate: null as any,
  checkResult: null as any,
  errorMessage: null as string | null,
  isChecking: false,
  isInstalling: false,
  isHandoffPending: false,
  installedReleasePublishedAt: null as string | null,
  checkNow: vi.fn(async () => undefined),
  install: vi.fn(async () => undefined),
}));

vi.mock("../controllers/pluginUpdateController", () => ({
  usePluginUpdateController: () => updateController,
}));
vi.mock("../utils/deckyInstaller", () => ({
  isDeckyInstallerAvailable: () => true,
}));

import { FocusablePanel } from "./FocusablePanel";
import { DescriptionSection } from "./DescriptionSection";
import { SettingsSection } from "./SettingsSection";
import { VersionsSection } from "./VersionsSection";
import { PluginUpdateSection } from "./PluginUpdateSection";
import { PluginPanelContent } from "./PluginPanelContent";

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
    let fallbackReveal: (() => void) | undefined;
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
    vi.stubGlobal("setTimeout", vi.fn((callback: () => void) => {
      fallbackReveal = callback;
      return 9;
    }));
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
    scroller.scrollTop = 36;
    fallbackReveal?.();
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

  it("renders the Updates rows in donor order with gamepad focus", () => {
    const tree = PluginUpdateSection({
      currentVersion: "0.1.1",
      updateChannel: "stable",
      automaticUpdateChecks: true,
      settingsLoaded: true,
      updateChannelBusy: false,
      automaticChecksBusy: false,
      onToggleUpdateChannel: vi.fn(),
      onToggleAutomaticUpdateChecks: vi.fn(),
    });
    const fields = collect(tree, "Field");
    const toggles = collect(tree, "ToggleField");
    const buttons = collect(tree, "ButtonItem");
    expect(tree.props.title).toBe("Updates");
    expect(fields.map((entry) => entry.props.label)).toEqual([
      "Installed Version",
      "Status",
    ]);
    expect(fields.every((entry) => entry.props.focusable === true)).toBe(true);
    expect(fields.every((entry) => entry.props.highlightOnFocus === true)).toBe(true);
    expect(toggles.map((entry) => entry.props.label)).toEqual([
      "Receive development releases",
      "Automatically check for updates",
    ]);
    expect(toggles.every((entry) => entry.props.highlightOnFocus === true)).toBe(true);
    expect(buttons.map((entry) => JSON.stringify(entry.props.children))).toEqual([
      expect.stringContaining("Check now"),
    ]);
    expect(JSON.stringify(tree)).toContain("(Local Build)");
    expect(JSON.stringify(tree)).toContain("Never checked");
  });

  it("renders available and error details without changing action order", () => {
    updateController.candidate = {
      version: "0.2.0",
      tag: "v0.2.0",
      channel: "stable",
      artifact_url: "https://example/plugin.zip",
      sha256: "a".repeat(64),
      release_url: "https://example/release",
      published_at: "2026-07-28T00:00:00Z",
      action: "update",
    };
    updateController.checkResult = {
      status: "available",
      checked_at: "2026-07-28T00:00:00Z",
      candidate: updateController.candidate,
    };
    updateController.errorMessage = "fixture warning";
    const tree = PluginUpdateSection({
      currentVersion: "0.1.1",
      updateChannel: "stable",
      automaticUpdateChecks: true,
      settingsLoaded: true,
      updateChannelBusy: false,
      automaticChecksBusy: false,
      onToggleUpdateChannel: vi.fn(),
      onToggleAutomaticUpdateChecks: vi.fn(),
    });
    const copy = JSON.stringify(tree);
    expect(copy).toContain("fixture warning");
    expect(copy).toContain("New version: v");
    expect(collect(tree, "ButtonItem").map((entry) => JSON.stringify(entry.props.children))).toEqual([
      expect.stringContaining("Update to v0.2.0"),
      expect.stringContaining("View Release Notes"),
      expect.stringContaining("Check now"),
    ]);
    updateController.candidate = null;
    updateController.checkResult = null;
    updateController.errorMessage = null;
  });

  it("wraps content in a preferred focus navigation group", () => {
    const tree = FocusablePanel({ children: "content" });
    expect(tree.type).toBe("Focusable");
    expect(tree.props.preferredFocus).toBe(true);
    expect(tree.props["flow-children"]).toBe("down");
  });

  it("orders Description, Settings, Updates, then Versions", () => {
    const tree = PluginPanelContent({
      descriptionRef: { current: null },
      settings: {
        feature_enabled: true,
        debug_logging: false,
        update_channel: "stable",
        automatic_update_checks: true,
      },
      settingsLoaded: true,
      featureBusy: false,
      debugBusy: false,
      updateChannelBusy: false,
      automaticChecksBusy: false,
      versions: { plugin: "0.1.1", decky: "3.2.6", steamos: "3.8" },
      onFeatureChange: vi.fn(),
      onDebugChange: vi.fn(),
      onUpdateChannelChange: vi.fn(),
      onAutomaticChecksChange: vi.fn(),
      onInstallVersionConfirmed: vi.fn(),
    });
    expect(tree.props.children.map((child: any) => child.type)).toEqual([
      DescriptionSection,
      SettingsSection,
      PluginUpdateSection,
      VersionsSection,
    ]);
  });
});
