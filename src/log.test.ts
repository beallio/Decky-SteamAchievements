import { beforeEach, describe, expect, it, vi } from "vitest";
import * as log from "./log";

describe("verbose frontend logging", () => {
  beforeEach(() => {
    log.setVerboseLogging(false);
    vi.restoreAllMocks();
  });

  it("gates debug and trace behind one switch", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const trace = vi.spyOn(console, "trace").mockImplementation(() => undefined);
    log.debug("test", "hidden");
    log.trace("test", "hidden");
    expect(debug).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();

    log.setVerboseLogging(true);
    log.debug("test", "shown");
    log.trace("test", "shown");
    expect(debug).toHaveBeenCalledWith("[Decky-SteamAchievements:test]", "shown");
    expect(trace).toHaveBeenCalledWith("[Decky-SteamAchievements:test]", "shown");
  });
});
