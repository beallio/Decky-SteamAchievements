import { describe, expect, it, vi } from "vitest";
import { SettingsCoordinator } from "./settingsCoordinator";

const defaults = { feature_enabled: true, debug_logging: false };

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
  const setVerboseLogging = vi.fn();
  const onError = vi.fn();
  const coordinator = new SettingsCoordinator({
    controller,
    defaults,
    loadSettings,
    setFeatureEnabled,
    setDebugLogging,
    setVerboseLogging,
    onError,
  });
  return {
    controller,
    coordinator,
    loadSettings,
    onError,
    setDebugLogging,
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

    pending.resolve({ feature_enabled: false, debug_logging: true });
    await pending.promise;
    await Promise.resolve();

    expect(test.coordinator.snapshot).toMatchObject({
      settings: { feature_enabled: false, debug_logging: true },
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

    feature.resolve({ feature_enabled: false, debug_logging: false });
    await feature.promise;
    await vi.waitFor(() => {
      expect(test.setDebugLogging).toHaveBeenCalledWith(true);
    });

    debug.resolve({ feature_enabled: false, debug_logging: true });
    await Promise.all([first, second]);
    expect(test.coordinator.snapshot.settings).toEqual({
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
    feature.resolve({ feature_enabled: true, debug_logging: false });
    await save;

    expect(test.controller.dispose).toHaveBeenCalledOnce();
    expect(test.controller.enabled).toBe(false);
    expect(test.controller.setEnabled).toHaveBeenCalledTimes(callsBeforeDispose);
  });
});
