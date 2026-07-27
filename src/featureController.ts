export class AchievementFeatureController {
  private disposer: (() => void) | undefined;

  constructor(
    private readonly installer: () => () => void,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  get enabled(): boolean {
    return this.disposer !== undefined;
  }

  setEnabled(enabled: boolean): boolean {
    if (enabled === this.enabled) return true;
    if (enabled) {
      try {
        this.disposer = this.installer();
        return true;
      } catch (error) {
        this.onError(error);
        this.disposer = undefined;
        return false;
      }
    }

    const dispose = this.disposer;
    this.disposer = undefined;
    try {
      dispose?.();
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  dispose(): void {
    this.setEnabled(false);
  }
}
