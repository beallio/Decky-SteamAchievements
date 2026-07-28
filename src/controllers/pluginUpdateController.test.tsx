import { describe, it, expect, vi, beforeEach } from "vitest";
import * as ludusaviRpc from "../backend";
import * as deckyInstaller from "../utils/deckyInstaller";


let stateIdx = 0;
let states: any[] = [];
let setters: any[] = [];

const { activeEffects, activeUnmounts } = vi.hoisted(() => ({ 
  activeEffects: [] as Array<{ cb: any, deps: any[] }>,
  activeUnmounts: [] as any[]
}));

vi.mock("react", () => ({
  useState: (init: any) => {
    const idx = stateIdx++;
    if (states.length <= idx) {
      states[idx] = init;
      setters[idx] = (v: any) => { states[idx] = typeof v === 'function' ? v(states[idx]) : v; };
    }
    return [states[idx], setters[idx]];
  },
  useReducer: (reducer: any, init: any) => {
    const idx = stateIdx++;
    if (states.length <= idx) {
      states[idx] = init;
      setters[idx] = (action: any) => { states[idx] = reducer(states[idx], action); };
    }
    return [states[idx], setters[idx]];
  },
  useEffect: (cb: any, deps: any[]) => {
    activeEffects.push({ cb, deps });
  },
  useCallback: (fn: any, deps: any[]) => {
    const idx = stateIdx++;
    if (states.length <= idx) {
      states[idx] = { fn, deps };
    } else {
      const prev = states[idx];
      const changed = !prev.deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        states[idx] = { fn, deps };
      }
    }
    return states[idx].fn;
  },
  useRef: (init: any) => {
    const idx = stateIdx++;
    if (states.length <= idx) {
      states[idx] = { current: init };
    }
    return states[idx];
  },
}));

vi.mock("@decky/api", () => ({
  callable: () => () => Promise.resolve(),
  toaster: { toast: vi.fn() }
}));

vi.mock("../backend", () => ({
  checkForPluginUpdateCall: vi.fn(),
  clearPendingUpdateInstallCall: vi.fn(),
  confirmUpdateInstallHandoffCall: vi.fn(),
  getUpdateCheckContextCall: vi.fn(),
  recordUpdateInstallRequestedCall: vi.fn(),
  revalidatePluginUpdateCall: vi.fn(),
}));

vi.mock("../utils/deckyInstaller", () => ({
  invokeDeckyInstaller: vi.fn(),
  INSTALL_TYPE_UPDATE: "UPDATE",
  INSTALL_TYPE_DOWNGRADE: "DOWNGRADE",
}));

import { usePluginUpdateController } from "./pluginUpdateController";

describe("PluginUpdateController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateIdx = 0;
    states = [];
    setters = [];
    activeEffects.length = 0;
    activeUnmounts.length = 0;
    vi.mocked(ludusaviRpc.getUpdateCheckContextCall).mockResolvedValue(null as any);
    vi.mocked(ludusaviRpc.checkForPluginUpdateCall).mockResolvedValue({ status: "current", checked_at: "now", channel: "stable" });
  });



  it("fails install and exits installing state if recordUpdateInstallRequestedCall fails", async () => {
    const candidate: any = {
      version: "0.2.0",
      tag: "v0.2.0",
      channel: "stable",
      action: "update",
      artifact_url: "url",
      sha256: "sha"
    };

    vi.mocked(ludusaviRpc.revalidatePluginUpdateCall).mockResolvedValue(candidate);
    vi.mocked(ludusaviRpc.recordUpdateInstallRequestedCall).mockResolvedValue({ status: "failed", message: "disk error" });
    vi.mocked(ludusaviRpc.clearPendingUpdateInstallCall).mockResolvedValue(null as any);

    stateIdx = 0;
    const controller = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false
    });

    try {
      await controller.install(candidate);
    } catch (e) {}

    expect(ludusaviRpc.revalidatePluginUpdateCall).toHaveBeenCalled();
    expect(ludusaviRpc.recordUpdateInstallRequestedCall).toHaveBeenCalled();
    expect(deckyInstaller.invokeDeckyInstaller).not.toHaveBeenCalled();

    stateIdx = 0;
    const updatedController = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false
    });

    expect(updatedController.isInstalling).toBe(false);
    expect(updatedController.errorMessage).toBe("disk error");
  });

  it("success path records, hands off, and confirms correctly", async () => {
    const candidate: any = {
      version: "0.2.0",
      tag: "v0.2.0",
      channel: "stable",
      action: "update",
      artifact_url: "url",
      sha256: "sha"
    };

    vi.mocked(ludusaviRpc.revalidatePluginUpdateCall).mockResolvedValue(candidate);
    vi.mocked(ludusaviRpc.recordUpdateInstallRequestedCall).mockResolvedValue({} as any);
    vi.mocked(deckyInstaller.invokeDeckyInstaller).mockResolvedValue(undefined as any);
    vi.mocked(ludusaviRpc.confirmUpdateInstallHandoffCall).mockResolvedValue({} as any);

    stateIdx = 0;
    const controller = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false
    });

    await controller.install(candidate);

    expect(ludusaviRpc.revalidatePluginUpdateCall).toHaveBeenCalled();
    expect(ludusaviRpc.recordUpdateInstallRequestedCall).toHaveBeenCalled();
    expect(deckyInstaller.invokeDeckyInstaller).toHaveBeenCalled();
    expect(ludusaviRpc.confirmUpdateInstallHandoffCall).toHaveBeenCalled();
    expect(
      vi.mocked(ludusaviRpc.recordUpdateInstallRequestedCall).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deckyInstaller.invokeDeckyInstaller).mock.invocationCallOrder[0],
    );

    stateIdx = 0;
    const updatedController = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false
    });

    expect(updatedController.isInstalling).toBe(false);
    expect(updatedController.errorMessage).toBe(null);
  });

  it("does not force an automatic check after pending-install hydration settles", async () => {
    vi.mocked(ludusaviRpc.getUpdateCheckContextCall).mockResolvedValue({
      update_channel: "stable",
      automatic_update_checks: true,
      installed_version: "0.2.0",
      effective_installed_version: "0.2.0",
      last_checked_at: null,
      last_checked_channel: null,
      last_available_tag: null,
      last_notified_tag: null,
      installed_release_tag: null,
      installed_release_published_at: null,
      pending_update_install: {
        version: "0.2.0",
        tag: "v0.2.0",
        channel: "stable",
        published_at: "2026-07-24T00:00:00Z",
        requested_at: "2026-07-24T00:00:00Z",
      },
      rate_limited_until: null,
    });

    usePluginUpdateController({
      currentVersion: "0.2.0",
      updateChannel: "stable",
      automaticUpdateChecks: true,
    });

    activeEffects[2].cb();
    await Promise.resolve();
    await Promise.resolve();

    stateIdx = 0;
    activeEffects.length = 0;
    usePluginUpdateController({
      currentVersion: "0.2.0",
      updateChannel: "stable",
      automaticUpdateChecks: true,
    });
    activeEffects[0].cb();
    activeEffects[3].cb();
    const automaticDepsBefore = activeEffects[3].deps;

    stateIdx = 0;
    activeEffects.length = 0;
    usePluginUpdateController({
      currentVersion: "0.2.0",
      updateChannel: "stable",
      automaticUpdateChecks: true,
    });
    const automaticEffect = activeEffects[3];
    const automaticDepsChanged = automaticEffect.deps.some(
      (dependency: unknown, index: number) =>
        dependency !== automaticDepsBefore[index],
    );
    if (automaticDepsChanged) {
      automaticEffect.cb();
    }
    await Promise.resolve();
    await Promise.resolve();

    expect(ludusaviRpc.checkForPluginUpdateCall).not.toHaveBeenCalledWith(
      "0.2.0",
      true,
    );
  });

  it("dependency arrays for re-check effects do not change on check result", () => {
    stateIdx = 0;
    activeEffects.length = 0;

    // Call hook to initialize state
    usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: true
    });

    const dispatch = setters[0];

    // Transition out of hydrating phase
    dispatch({ type: "HYDRATION_COMPLETE", installedReleasePublishedAt: null });

    // Render again
    stateIdx = 0;
    activeEffects.length = 0;
    usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: true
    });

    // Capture the dependency arrays of all effects (the ones at index 3 and 4 are the ones we care about)
    const depsBefore = activeEffects.map(e => e.deps);

    // Transition to available
    dispatch({ type: "CHECK_SUCCESS_AVAILABLE", result: { status: "available" } as any, candidate: { version: "0.2.0" } as any });

    // Render again
    stateIdx = 0;
    activeEffects.length = 0;
    usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: true
    });

    const depsAfter = activeEffects.map(e => e.deps);

    // If the fix is correct (using isHydrated instead of state.phase), the deps will be identical.
    expect(depsAfter).toEqual(depsBefore);
  });

  it("suppresses a late check result after unmount cleanup", async () => {
    let resolveCheck!: (value: any) => void;
    vi.mocked(ludusaviRpc.checkForPluginUpdateCall).mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const controller = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false,
    });
    const checking = controller.checkNow();
    await Promise.resolve();
    const cleanup = activeEffects[1].cb();
    cleanup();
    resolveCheck({
      status: "available",
      checked_at: "now",
      candidate: { version: "0.2.0" },
    });
    await checking;

    stateIdx = 0;
    activeEffects.length = 0;
    const after = usePluginUpdateController({
      currentVersion: "0.1.0",
      updateChannel: "stable",
      automaticUpdateChecks: false,
    });
    expect(after.candidate).toBe(null);
  });
});

import { updateReducer, initialUpdateState, UpdateState } from "./pluginUpdateReducer";

describe("pluginUpdateReducer", () => {
  it("transitions correctly on hydration complete with pending install", () => {
    const action: any = {
      type: "HYDRATION_COMPLETE",
      installedReleasePublishedAt: "2026-06-19T00:00:00Z",
      pendingInstall: {
        version: "0.2.0",
        channel: "stable",
        preInstallVersion: "0.1.0"
      }
    };
    const newState = updateReducer(initialUpdateState, action);
    expect(newState.phase).toBe("installed");
    expect(newState.pendingInstallVersion).toBe("0.2.0");
    expect(newState.checkResult?.status).toBe("current");
  });

  it("transitions correctly on check timeout", () => {
    const checkingState: UpdateState = { ...initialUpdateState, phase: "checking" };
    const newState = updateReducer(checkingState, { type: "CHECK_TIMEOUT", message: "timeout" });
    expect(newState.phase).toBe("failed");
    expect(newState.errorMessage).toBe("timeout");
  });

  it("transitions correctly on check failed", () => {
    const checkingState: UpdateState = { ...initialUpdateState, phase: "checking" };
    const newState = updateReducer(checkingState, { type: "CHECK_FAILED", message: "error" });
    expect(newState.phase).toBe("failed");
    expect(newState.errorMessage).toBe("error");
  });

  it("transitions correctly on install handoff pending", () => {
    const installingState: UpdateState = { ...initialUpdateState, phase: "installing" };
    const newState = updateReducer(installingState, { type: "INSTALL_HANDOFF_PENDING" });
    expect(newState.phase).toBe("handoff_pending");
  });

  it("clears installed override", () => {
    const installedState: UpdateState = {
      ...initialUpdateState,
      phase: "installed",
      installedOverride: { version: "0.2.0", channel: "stable", preInstallVersion: "0.1.0" }
    };
    const newState = updateReducer(installedState, { type: "CLEAR_INSTALLED_OVERRIDE" });
    expect(newState.phase).toBe("idle");
    expect(newState.installedOverride).toBe(null);
  });
});
