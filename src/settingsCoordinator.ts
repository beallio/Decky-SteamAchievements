import type { PluginSettings } from "./backend";

type FeatureController = {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): boolean;
  dispose(): void;
};

export type SettingsSnapshot = {
  settings: PluginSettings;
  loaded: boolean;
  featureBusy: boolean;
  debugBusy: boolean;
};

type SettingsCoordinatorOptions = {
  controller: FeatureController;
  defaults: PluginSettings;
  loadSettings: () => Promise<PluginSettings>;
  setFeatureEnabled: (enabled: boolean) => Promise<PluginSettings>;
  setDebugLogging: (enabled: boolean) => Promise<PluginSettings>;
  setVerboseLogging: (enabled: boolean) => void;
  onError?: (operation: "load" | "feature" | "debug", error: unknown) => void;
};

type Listener = (snapshot: SettingsSnapshot) => void;

/**
 * Own the settings lifecycle shared by plugin startup and QAM content.
 *
 * One load feeds every subscriber, mutations are globally serialized, and disposal is terminal.
 * This keeps late RPC responses from touching an unloaded plugin or overwriting another toggle.
 */
export class SettingsCoordinator {
  private active = true;
  private started = false;
  private listeners = new Set<Listener>();
  private queue: Promise<void> = Promise.resolve();
  private state: SettingsSnapshot;

  constructor(private readonly options: SettingsCoordinatorOptions) {
    this.state = {
      settings: { ...options.defaults },
      loaded: false,
      featureBusy: false,
      debugBusy: false,
    };
  }

  get snapshot(): SettingsSnapshot {
    return {
      ...this.state,
      settings: { ...this.state.settings },
    };
  }

  subscribe(listener: Listener): () => void {
    if (!this.active) return () => undefined;
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started || !this.active) return;
    this.started = true;
    void this.options
      .loadSettings()
      .then((settings) => {
        if (!this.active) return;
        this.applySettings(settings);
        this.update({ loaded: true });
      })
      .catch((error) => {
        if (!this.active) return;
        this.options.onError?.("load", error);
        this.applySettings(this.options.defaults);
        this.update({ loaded: true });
      });
  }

  setFeatureEnabled(enabled: boolean): Promise<void> {
    return this.enqueue("feature", enabled);
  }

  setDebugLogging(enabled: boolean): Promise<void> {
    return this.enqueue("debug", enabled);
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.listeners.clear();
    this.options.controller.dispose();
  }

  private notify(): void {
    if (!this.active) return;
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private update(patch: Partial<SettingsSnapshot>): void {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private applySettings(settings: PluginSettings): void {
    if (!this.active) return;
    const next = { ...settings };
    if (!this.options.controller.setEnabled(next.feature_enabled)) {
      next.feature_enabled = this.options.controller.enabled;
    }
    this.options.setVerboseLogging(next.debug_logging);
    this.update({ settings: next });
  }

  private enqueue(operation: "feature" | "debug", enabled: boolean): Promise<void> {
    if (!this.active || !this.state.loaded) return Promise.resolve();
    const busyKey = operation === "feature" ? "featureBusy" : "debugBusy";
    if (this.state[busyKey]) return Promise.resolve();
    this.update({ [busyKey]: true });

    const task = this.queue.then(async () => {
      if (!this.active) return;
      const previous = { ...this.state.settings };

      if (operation === "feature") {
        if (!this.options.controller.setEnabled(enabled)) return;
        this.update({
          settings: { ...previous, feature_enabled: enabled },
        });
      } else {
        this.options.setVerboseLogging(enabled);
        this.update({
          settings: { ...previous, debug_logging: enabled },
        });
      }

      try {
        const saved =
          operation === "feature"
            ? await this.options.setFeatureEnabled(enabled)
            : await this.options.setDebugLogging(enabled);
        if (this.active) this.applySettings(saved);
      } catch (error) {
        if (!this.active) return;
        this.applySettings(previous);
        this.options.onError?.(operation, error);
      }
    });

    this.queue = task.catch(() => undefined);
    return task.finally(() => {
      if (this.active) this.update({ [busyKey]: false });
    });
  }
}
