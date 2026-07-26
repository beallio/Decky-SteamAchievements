import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addPatch: vi.fn(),
  removePatch: vi.fn(),
  afterPatch: vi.fn(),
  findInReactTree: vi.fn(),
  findModuleExport: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@decky/api", () => ({
  routerHook: {
    addPatch: mocks.addPatch,
    removePatch: mocks.removePatch,
  },
}));

vi.mock("@decky/ui", () => ({
  afterPatch: mocks.afterPatch,
  findInReactTree: mocks.findInReactTree,
  findModuleExport: mocks.findModuleExport,
}));

vi.mock("./log", () => ({
  debug: mocks.debug,
  info: mocks.info,
  warn: mocks.warn,
}));

import {
  injectOnSeek,
  installAchievementBarPatch,
  isSuppressedAchievementPlayBar,
} from "./achievementBar";

const APP_ROUTE = "/library/app/:appid";

function ValveMiniAchievements(props?: { onSeek: (section: string) => void }) {
  if (false) props?.onSeek("achievements");
  return null;
}

function ValveGameStatsSection() {
  return styles.GameStatsSection;
}

const styles = { GameStatsSection: "unused-in-tests" };

function suppressedNode(type: unknown = ValveMiniAchievements) {
  return {
    type,
    props: {
      onSeek: undefined,
      details: { unAppID: 1942280 },
      overview: { installed: true },
    },
  };
}

function walkReactTree(node: any, filter: (candidate: any) => boolean): any {
  if (!node || typeof node !== "object") return undefined;
  if (filter(node)) return node;

  for (const key of ["props", "children", "child", "sibling"]) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        const match = walkReactTree(child, filter);
        if (match) return match;
      }
    } else {
      const match = walkReactTree(value, filter);
      if (match) return match;
    }
  }

  return undefined;
}

function routeCallback(): (props: any) => any {
  return mocks.addPatch.mock.calls[0][1];
}

describe("isSuppressedAchievementPlayBar", () => {
  it("matches a source-signature-anchored suppressed node", () => {
    expect(isSuppressedAchievementPlayBar(suppressedNode())).toBe(true);
  });

  it("matches a Valve CSS-key signature in component source", () => {
    expect(isSuppressedAchievementPlayBar(suppressedNode(ValveGameStatsSection))).toBe(true);
  });

  it("does not match or clobber a node with an existing handler", () => {
    const node = suppressedNode();
    node.props.onSeek = vi.fn();

    expect(isSuppressedAchievementPlayBar(node)).toBe(false);
  });

  it("requires own details and overview props", () => {
    const missingDetails = suppressedNode();
    delete (missingDetails.props as any).details;
    const missingOverview = suppressedNode();
    delete (missingOverview.props as any).overview;

    expect(isSuppressedAchievementPlayBar(missingDetails)).toBe(false);
    expect(isSuppressedAchievementPlayBar(missingOverview)).toBe(false);
  });

  it("rejects malformed and generic prop-shape-only nodes", () => {
    const generic = suppressedNode(function UnrelatedComponent() {
      return null;
    });

    expect(isSuppressedAchievementPlayBar(null)).toBe(false);
    expect(isSuppressedAchievementPlayBar({})).toBe(false);
    expect(isSuppressedAchievementPlayBar(generic)).toBe(false);
  });

  it("never throws when getters or function stringification throw", () => {
    const throwingProps = Object.defineProperty({}, "props", {
      get: () => {
        throw new Error("props unavailable");
      },
    });
    const throwingType = suppressedNode(
      new Proxy(function Component() {}, {
        get(target, property, receiver) {
          if (property === "toString") throw new Error("source unavailable");
          return Reflect.get(target, property, receiver);
        },
      }),
    );

    expect(() => isSuppressedAchievementPlayBar(throwingProps)).not.toThrow();
    expect(isSuppressedAchievementPlayBar(throwingProps)).toBe(false);
    expect(() => isSuppressedAchievementPlayBar(throwingType)).not.toThrow();
    expect(isSuppressedAchievementPlayBar(throwingType)).toBe(false);
  });
});

describe("injectOnSeek", () => {
  it("injects a handler into a suppressed node", () => {
    const node = suppressedNode();
    const handler = vi.fn();

    expect(injectOnSeek(node, handler)).toBe(true);
    expect(node.props.onSeek).toBe(handler);
  });

  it("leaves an existing handler untouched", () => {
    const node = suppressedNode();
    const existing = vi.fn();
    node.props.onSeek = existing;

    expect(injectOnSeek(node, vi.fn())).toBe(false);
    expect(node.props.onSeek).toBe(existing);
  });

  it("returns false without throwing for malformed or frozen props", () => {
    const frozen = suppressedNode();
    Object.freeze(frozen.props);

    expect(() => injectOnSeek(null, vi.fn())).not.toThrow();
    expect(injectOnSeek(null, vi.fn())).toBe(false);
    expect(() => injectOnSeek(frozen, vi.fn())).not.toThrow();
    expect(injectOnSeek(frozen, vi.fn())).toBe(false);
    expect(frozen.props.onSeek).toBeUndefined();
  });
});

describe("installAchievementBarPatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.addPatch.mockImplementation((_path, patch) => patch);
    mocks.afterPatch.mockImplementation((owner, property, handler) => {
      const original = owner[property];
      const patch = {
        unpatch: vi.fn(() => {
          owner[property] = original;
        }),
      };

      owner[property] = function (this: unknown, ...args: any[]) {
        const result = original.apply(this, args);
        return handler(args, result);
      };

      return patch;
    });
    mocks.findInReactTree.mockImplementation(walkReactTree);
    mocks.findModuleExport.mockReturnValue(undefined);
  });

  it("patches renderFunc output and disposes both patch layers", () => {
    const target = suppressedNode();
    const tree = { props: { children: [{ props: { label: "PLAY TIME" } }, target] } };
    const owner = { renderFunc: vi.fn(() => tree) };
    const props = { children: { props: owner } };

    const unpatch = installAchievementBarPatch();

    expect(mocks.addPatch).toHaveBeenCalledWith(APP_ROUTE, expect.any(Function));
    expect(routeCallback()(props)).toBe(props);
    expect(owner.renderFunc()).toBe(tree);
    expect(typeof target.props.onSeek).toBe("function");
    target.props.onSeek("achievements");
    expect(mocks.debug).toHaveBeenCalledWith(
      "patch",
      "achievement stat activated",
      "achievements",
    );

    const renderPatch = mocks.afterPatch.mock.results[0].value;
    unpatch();

    expect(mocks.removePatch).toHaveBeenCalledWith(APP_ROUTE, routeCallback());
    expect(renderPatch.unpatch).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", {}],
    ["non-callable", { renderFunc: "not a function" }],
  ])("fails closed when renderFunc is %s", (_label, owner) => {
    const props = { children: { props: owner } };
    const before = structuredClone(props);
    installAchievementBarPatch();

    expect(() => routeCallback()(props)).not.toThrow();
    expect(routeCallback()(props)).toBe(props);
    expect(props).toEqual(before);
    expect(mocks.afterPatch).not.toHaveBeenCalled();
  });

  it("replaces a prior owner patch and skips re-patching the same owner", () => {
    const firstOwner = { renderFunc: () => ({}) };
    const secondOwner = { renderFunc: () => ({}) };
    const unpatch = installAchievementBarPatch();
    const callback = routeCallback();

    callback({ children: { props: firstOwner } });
    const firstPatch = mocks.afterPatch.mock.results[0].value;
    callback({ children: { props: secondOwner } });
    const secondPatch = mocks.afterPatch.mock.results[1].value;

    expect(firstPatch.unpatch).toHaveBeenCalledOnce();
    expect(
      firstPatch.unpatch.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.afterPatch.mock.invocationCallOrder[1]);

    callback({ children: { props: secondOwner } });
    expect(mocks.afterPatch).toHaveBeenCalledTimes(2);

    unpatch();
    expect(secondPatch.unpatch).toHaveBeenCalledOnce();
  });

  it("leaves render output unchanged when tree search throws", () => {
    const tree = { props: { children: [] } };
    const owner = { renderFunc: () => tree };
    mocks.findInReactTree.mockImplementation(() => {
      throw new Error("tree changed");
    });
    installAchievementBarPatch();
    routeCallback()({ children: { props: owner } });

    expect(() => owner.renderFunc()).not.toThrow();
    expect(owner.renderFunc()).toBe(tree);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("leaves a frozen target and render output unchanged", () => {
    const target = suppressedNode();
    Object.freeze(target.props);
    const tree = { props: { children: target } };
    const owner = { renderFunc: () => tree };
    installAchievementBarPatch();
    routeCallback()({ children: { props: owner } });

    expect(() => owner.renderFunc()).not.toThrow();
    expect(owner.renderFunc()).toBe(tree);
    expect(target.props.onSeek).toBeUndefined();
  });

  it("catches throwing route props without mutation", () => {
    const props = Object.defineProperty({}, "children", {
      get: () => {
        throw new Error("children unavailable");
      },
    });
    installAchievementBarPatch();

    expect(() => routeCallback()(props)).not.toThrow();
    expect(routeCallback()(props)).toBe(props);
    expect(mocks.afterPatch).not.toHaveBeenCalled();
  });

  it("attempts both final disposers and catches their errors", () => {
    const owner = { renderFunc: () => ({}) };
    mocks.removePatch.mockImplementation(() => {
      throw new Error("route disposer failed");
    });
    mocks.afterPatch.mockImplementation(() => ({
      unpatch: vi.fn(() => {
        throw new Error("render disposer failed");
      }),
    }));
    const unpatch = installAchievementBarPatch();
    routeCallback()({ children: { props: owner } });
    const renderPatch = mocks.afterPatch.mock.results[0].value;

    expect(() => unpatch()).not.toThrow();
    expect(mocks.removePatch).toHaveBeenCalledOnce();
    expect(renderPatch.unpatch).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });

  it("returns a safe disposer when route patch registration throws", () => {
    mocks.addPatch.mockImplementation(() => {
      throw new Error("router unavailable");
    });

    const unpatch = installAchievementBarPatch();

    expect(mocks.warn).toHaveBeenCalled();
    expect(() => unpatch()).not.toThrow();
    expect(mocks.removePatch).not.toHaveBeenCalled();
  });
});
