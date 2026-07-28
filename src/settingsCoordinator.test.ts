import { describe, expect, it, vi } from "vitest";
import { SettingsCoordinator } from "./settingsCoordinator";
import type { PluginSettings } from "./backend";

const defaults: PluginSettings = {
  feature_enabled: true,
  debug_logging: false,
  update_channel: "stable",
  automatic_update_checks: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function harness() {
  let enabled = false;
  const controller = {
    get enabled() {
      return enabled;
    },
    setEnabled: vi.fn((next: boolean) => {
      enabled = next;
      return true;
    }),
    dispose: vi.fn(() => {
      enabled = false;
    }),
  };
  const loadSettings = vi.fn(async () => defaults);
  const setFeatureEnabled = vi.fn(async (feature_enabled: boolean) => ({
    ...defaults,
    feature_enabled,
  }));
  const setDebugLogging = vi.fn(async (debug_logging: boolean) => ({
    ...defaults,
    debug_logging,
  }));
  const setUpdateChannel = vi.fn(async (update_channel: "stable" | "development") => ({
    ...defaults,
    update_channel,
  }));
  const setAutomaticUpdateChecks = vi.fn(async (automatic_update_checks: boolean) => ({
    ...defaults,
    automatic_update_checks,
  }));
  const setVerboseLogging = vi.fn();
  const onError = vi.fn();
  const coordinator = new SettingsCoordinator({
    controller,
    defaults,
    loadSettings,
    setFeatureEnabled,
    setDebugLogging,
    setUpdateChannel,
    setAutomaticUpdateChecks,
    setVerboseLogging,
    onError,
  });
  return {
    controller,
    coordinator,
    loadSettings,
    onError,
    setDebugLogging,
    setUpdateChannel,
    setAutomaticUpdateChecks,
    setFeatureEnabled,
    setVerboseLogging,
  };
}

describe("SettingsCoordinator", () => {
  it("loads settings exactly once and shares the resulting snapshot", async () => {
    const pending = deferred<typeof defaults>();
    const test = harness();
    test.loadSettings.mockReturnValue(pending.promise);
    const snapshots: any[] = [];
    test.coordinator.subscribe((snapshot) => snapshots.push(snapshot));

    test.coordinator.start();
    test.coordinator.start();
    expect(test.loadSettings).toHaveBeenCalledOnce();

    pending.resolve({ ...defaults, feature_enabled: false, debug_logging: true });
    await pending.promise;
    await Promise.resolve();

    expect(test.coordinator.snapshot).toMatchObject({
      settings: { ...defaults, feature_enabled: false, debug_logging: true },
      loaded: true,
    });
    expect(test.controller.setEnabled).toHaveBeenLastCalledWith(false);
    expect(test.setVerboseLogging).toHaveBeenLastCalledWith(true);
    expect(snapshots[snapshots.length - 1]).toEqual(test.coordinator.snapshot);
  });

  it("serializes cross-toggle writes and applies backend responses in order", async () => {
    const feature = deferred<typeof defaults>();
    const debug = deferred<typeof defaults>();
    const test = harness();
    test.setFeatureEnabled.mockReturnValue(feature.promise);
    test.setDebugLogging.mockReturnValue(debug.promise);
    test.coordinator.start();
    await Promise.resolve();
    await Promise.resolve();

    const first = test.coordinator.setFeatureEnabled(false);
    const second = test.coordinator.setDebugLogging(true);
    await Promise.resolve();
    expect(test.setFeatureEnabled).toHaveBeenCalledWith(false);
    expect(test.setDebugLogging).not.toHaveBeenCalled();

    feature.resolve({ ...defaults, feature_enabled: false, debug_logging: false });
    await feature.promise;
    await vi.waitFor(() => {
      expect(test.setDebugLogging).toHaveBeenCalledWith(true);
    });

    debug.resolve({ ...defaults, feature_enabled: false, debug_logging: true });
    await Promise.all([first, second]);
    expect(test.coordinator.snapshot.settings).toEqual({
      ...defaults,
      feature_enabled: false,
      debug_logging: true,
    });
  });

  it("rolls back a failed write before processing the next queued setting", async () => {
    const feature = deferred<typeof defaults>();
    const test = harness();
    test.setFeatureEnabled.mockReturnValue(feature.promise);
    test.coordinator.start();
    await Promise.resolve();
    await Promise.resolve();

    const first = test.coordinator.setFeatureEnabled(false);
    const second = test.coordinator.setDebugLogging(true);
    feature.reject(new Error("feature save failed"));
    await Promise.all([first, second]);

    expect(test.onError).toHaveBeenCalledWith("feature", expect.any(Error));
    expect(test.coordinator.snapshot.settings).toEqual({
      ...defaults,
      feature_enabled: true,
      debug_logging: true,
    });
  });

  it("ignores late load/save effects after terminal disposal", async () => {
    const load = deferred<typeof defaults>();
    const feature = deferred<typeof defaults>();
    const test = harness();
    test.loadSettings.mockReturnValue(load.promise);
    test.setFeatureEnabled.mockReturnValue(feature.promise);
    test.coordinator.start();

    load.resolve(defaults);
    await load.promise;
    await Promise.resolve();
    const save = test.coordinator.setFeatureEnabled(false);
    await Promise.resolve();
    const callsBeforeDispose = test.controller.setEnabled.mock.calls.length;
    test.coordinator.dispose();
    feature.resolve({ ...defaults, feature_enabled: true, debug_logging: false });
    await save;

    expect(test.controller.dispose).toHaveBeenCalledOnce();
    expect(test.controller.enabled).toBe(false);
    expect(test.controller.setEnabled).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  it("serializes updater writes with independent busy flags", async () => {
    const channel = deferred<typeof defaults>();
    const automatic = deferred<typeof defaults>();
    const test = harness();
    test.setUpdateChannel.mockReturnValue(channel.promise);
    test.setAutomaticUpdateChecks.mockReturnValue(automatic.promise);
    test.coordinator.start();
    await Promise.resolve();
    await Promise.resolve();

    const first = test.coordinator.setUpdateChannel("development");
    const second = test.coordinator.setAutomaticUpdateChecks(false);
    expect(test.coordinator.snapshot.updateChannelBusy).toBe(true);
    expect(test.coordinator.snapshot.automaticChecksBusy).toBe(true);
    await Promise.resolve();
    expect(test.setUpdateChannel).toHaveBeenCalledWith("development");
    expect(test.setAutomaticUpdateChecks).not.toHaveBeenCalled();

    channel.resolve({ ...defaults, update_channel: "development" });
    await vi.waitFor(() => expect(test.setAutomaticUpdateChecks).toHaveBeenCalledWith(false));
    automatic.resolve({
      ...defaults,
      update_channel: "development",
      automatic_update_checks: false,
    });
    await Promise.all([first, second]);
    expect(test.coordinator.snapshot.settings.update_channel).toBe("development");
    expect(test.coordinator.snapshot.settings.automatic_update_checks).toBe(false);
    expect(test.coordinator.snapshot.updateChannelBusy).toBe(false);
    expect(test.coordinator.snapshot.automaticChecksBusy).toBe(false);
  });

  it("rolls back a failed updater write and ignores late completion after dispose", async () => {
    const channel = deferred<typeof defaults>();
    const test = harness();
    test.setUpdateChannel.mockReturnValue(channel.promise);
    test.coordinator.start();
    await Promise.resolve();
    await Promise.resolve();

    const save = test.coordinator.setUpdateChannel("development");
    channel.reject(new Error("channel save failed"));
    await save;
    expect(test.coordinator.snapshot.settings.update_channel).toBe("stable");
    expect(test.onError).toHaveBeenCalledWith("updateChannel", expect.any(Error));

    const automatic = deferred<typeof defaults>();
    test.setAutomaticUpdateChecks.mockReturnValue(automatic.promise);
    const lateSave = test.coordinator.setAutomaticUpdateChecks(false);
    await Promise.resolve();
    const before = test.coordinator.snapshot;
    test.coordinator.dispose();
    automatic.resolve({ ...defaults, automatic_update_checks: false });
    await lateSave;
    expect(test.coordinator.snapshot).toEqual(before);
  });
});
