import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addPatch: vi.fn(),
  removePatch: vi.fn(),
  afterPatch: vi.fn(),
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
}));

vi.mock("./log", () => ({
  debug: mocks.debug,
  info: mocks.info,
  warn: mocks.warn,
}));

import {
  captureMiniAchievementsClass,
  findAncestorStateNode,
  findClassInFiberTree,
  getBigPictureDocument,
  hasAchievementRenderSignature,
  installAchievementBarPatch,
  patchMiniAchievementsRender,
  resolveSeekController,
  steamGlobals,
  withOnSeek,
} from "./achievementBar";

const APP_ROUTE = "/library/app/:appid";

function MiniAchievementsSignatureDouble() {
  if (false) ({ onSeek: (_section: string) => undefined }).onSeek("achievements");
}

function routeCallback(): (props: unknown) => unknown {
  return mocks.addPatch.mock.calls[0][1];
}

function fiberElement(fiber: object): object {
  return { "__reactFiber$test": fiber };
}

function popup(document: object, title = ""): object {
  return {
    m_strTitle: title,
    m_popup: { document },
  };
}

describe("hasAchievementRenderSignature", () => {
  it("matches double- and single-quoted achievement seek signatures", () => {
    function singleQuotedSignature() {
      if (false) ({ onSeek: (_section: string) => undefined }).onSeek('achievements');
    }

    expect(hasAchievementRenderSignature(MiniAchievementsSignatureDouble)).toBe(true);
    expect(hasAchievementRenderSignature(singleQuotedSignature)).toBe(true);
  });

  it.each([null, undefined, {}, "component", 42])(
    "rejects non-function value %s",
    (candidate) => {
      expect(hasAchievementRenderSignature(candidate)).toBe(false);
    },
  );

  it("rejects unrelated functions and throwing stringification", () => {
    function Unrelated() {
      return null;
    }
    const throwing = new Proxy(function Component() {}, {
      get(target, property, receiver) {
        if (property === "toString") throw new Error("source unavailable");
        return Reflect.get(target, property, receiver);
      },
    });

    expect(hasAchievementRenderSignature(Unrelated)).toBe(false);
    expect(() => hasAchievementRenderSignature(throwing)).not.toThrow();
    expect(hasAchievementRenderSignature(throwing)).toBe(false);
  });
});

describe("withOnSeek", () => {
  const handler = vi.fn();

  it.each([
    {},
    { onSeek: undefined },
    { onSeek: null },
  ])("adds the handler when onSeek is absent or nullish", (props) => {
    const result = withOnSeek(props, handler);

    expect(result).not.toBe(props);
    expect(result).toEqual({ ...props, onSeek: handler });
  });

  it("leaves an existing handler and object untouched", () => {
    const existing = vi.fn();
    const props = { onSeek: existing, other: true };

    expect(withOnSeek(props, handler)).toBe(props);
    expect(props.onSeek).toBe(existing);
  });

  it.each([null, undefined, "props", 10, true, () => undefined])(
    "passes through non-object props %s",
    (props) => {
      expect(withOnSeek(props, handler)).toBe(props);
    },
  );

  it("never throws when props access fails", () => {
    const props = new Proxy(
      {},
      {
        get() {
          throw new Error("props unavailable");
        },
      },
    );

    expect(() => withOnSeek(props, handler)).not.toThrow();
    expect(withOnSeek(props, handler)).toBe(props);
  });
});

describe("findAncestorStateNode", () => {
  it("returns the nearest matching state node", () => {
    const controller = { SeekToSection: vi.fn() };
    const fiber = {
      stateNode: {},
      return: {
        stateNode: controller,
        return: { stateNode: { SeekToSection: vi.fn() } },
      },
    };

    expect(
      findAncestorStateNode(
        fiber,
        (stateNode) => typeof stateNode?.SeekToSection === "function",
      ),
    ).toBe(controller);
  });

  it("returns undefined when absent or beyond the supplied bound", () => {
    const controller = { SeekToSection: vi.fn() };
    const fiber = {
      return: {
        return: {
          stateNode: controller,
        },
      },
    };

    expect(findAncestorStateNode(fiber, () => false)).toBeUndefined();
    expect(
      findAncestorStateNode(
        fiber,
        (stateNode) => stateNode === controller,
        2,
      ),
    ).toBeUndefined();
    expect(findAncestorStateNode({}, () => true)).toBeUndefined();
  });

  it("fails closed when fiber access or the predicate throws", () => {
    const fiber = Object.defineProperty({}, "stateNode", {
      get: () => {
        throw new Error("fiber unavailable");
      },
    });

    expect(() => findAncestorStateNode(fiber, () => true)).not.toThrow();
    expect(findAncestorStateNode(fiber, () => true)).toBeUndefined();
    expect(findAncestorStateNode({ stateNode: {} }, () => {
      throw new Error("bad predicate");
    })).toBeUndefined();
  });
});

describe("findClassInFiberTree", () => {
  it("finds a deeply nested matching elementType", () => {
    const root = {
      child: {
        type: function Other() {},
        child: {
          elementType: MiniAchievementsSignatureDouble,
        },
      },
    };

    expect(findClassInFiberTree(root, hasAchievementRenderSignature)).toBe(
      MiniAchievementsSignatureDouble,
    );
  });

  it("walks siblings and respects the node bound", () => {
    const root = {
      type: function First() {},
      sibling: {
        type: MiniAchievementsSignatureDouble,
      },
    };

    expect(findClassInFiberTree(root, hasAchievementRenderSignature, 1)).toBeUndefined();
    expect(findClassInFiberTree(root, hasAchievementRenderSignature, 2)).toBe(
      MiniAchievementsSignatureDouble,
    );
  });

  it("returns undefined when absent or malformed", () => {
    expect(findClassInFiberTree({ child: {} }, hasAchievementRenderSignature)).toBeUndefined();
    expect(findClassInFiberTree(null, hasAchievementRenderSignature)).toBeUndefined();
    expect(() =>
      findClassInFiberTree(
        Object.defineProperty({}, "type", {
          get: () => {
            throw new Error("fiber unavailable");
          },
        }),
        hasAchievementRenderSignature,
      ),
    ).not.toThrow();
  });
});

describe("getBigPictureDocument", () => {
  it("prefers the BPM document in a popup Map", () => {
    const fallbackDocument = { body: fiberElement({}) };
    const bpmDocument = { body: fiberElement({}) };
    const manager = {
      m_rgPopups: new Map([
        ["fallback", popup(fallbackDocument, "Overlay")],
        ["bpm", popup(bpmDocument, "Steam Big Picture Mode")],
      ]),
    };

    expect(getBigPictureDocument(manager)).toBe(bpmDocument);
  });

  it("supports GetPopups arrays and falls back to any fiber document", () => {
    const document = { body: fiberElement({}) };
    const manager = {
      GetPopups: () => [
        popup({ body: {} }, "Steam Big Picture Mode"),
        popup(document, "Other"),
      ],
    };

    expect(getBigPictureDocument(manager)).toBe(document);
  });

  it("finds a queryable fiber anchor", () => {
    const anchor = fiberElement({});
    const document = {
      body: {},
      querySelectorAll: () => [{}, anchor],
    };

    expect(getBigPictureDocument({ m_rgPopups: [popup(document)] })).toBe(document);
  });

  it.each([
    undefined,
    {},
    { m_rgPopups: [] },
    { m_rgPopups: [null, {}, popup({ body: {} })] },
  ])("returns undefined for malformed manager %s", (manager) => {
    expect(() => getBigPictureDocument(manager)).not.toThrow();
    expect(getBigPictureDocument(manager)).toBeUndefined();
  });
});

describe("captureMiniAchievementsClass", () => {
  it("composes popup lookup, root climb, and fiber DFS", () => {
    const miniFiber = { elementType: MiniAchievementsSignatureDouble };
    const root = { child: { child: miniFiber } };
    const leaf = { return: root };
    const document = { body: fiberElement(leaf) };

    expect(
      captureMiniAchievementsClass({
        m_rgPopups: [popup(document, "Steam Big Picture Mode")],
      }),
    ).toBe(MiniAchievementsSignatureDouble);
  });

  it("returns undefined without throwing when capture data is malformed", () => {
    const manager = Object.defineProperty({}, "m_rgPopups", {
      get: () => {
        throw new Error("popups unavailable");
      },
    });

    expect(() => captureMiniAchievementsClass(manager)).not.toThrow();
    expect(captureMiniAchievementsClass(manager)).toBeUndefined();
  });
});

describe("resolveSeekController", () => {
  it("resolves the nearest SeekToSection controller", () => {
    const controller = { SeekToSection: vi.fn() };
    const instance = {
      _reactInternals: {
        return: {
          stateNode: controller,
        },
      },
    };

    expect(resolveSeekController(instance)).toBe(controller);
  });

  it.each([
    undefined,
    {},
    { _reactInternals: {} },
    { _reactInternalFiber: { return: { stateNode: {} } } },
  ])("returns undefined for an instance without a controller", (instance) => {
    expect(() => resolveSeekController(instance)).not.toThrow();
    expect(resolveSeekController(instance)).toBeUndefined();
  });
});

describe("patchMiniAchievementsRender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("installs persistent props and schedules one re-render per instance", () => {
    let handler: Function | undefined;
    const unpatch = vi.fn();
    const fakeAfterPatch = vi.fn((_target, _method, callback) => {
      handler = callback;
      return { unpatch };
    });
    class MiniClass {
      props: any = { details: true };
      forceUpdate = vi.fn();
    }
    const controller = { SeekToSection: vi.fn() };
    const instance = new MiniClass() as any;
    instance._reactInternals = { return: { stateNode: controller } };

    const patch = patchMiniAchievementsRender(MiniClass, {
      afterPatch: fakeAfterPatch,
    });

    expect(fakeAfterPatch).toHaveBeenCalledWith(
      MiniClass.prototype,
      "render",
      expect.any(Function),
    );
    expect(patch).toEqual({ unpatch });

    expect(handler?.call(instance, [], null)).toBeNull();
    expect(typeof instance.props.onSeek).toBe("function");
    instance.props.onSeek("achievements");
    expect(controller.SeekToSection).toHaveBeenCalledWith("achievements");

    instance.props = { replacement: true, onSeek: null };
    expect(instance.props).toMatchObject({
      replacement: true,
      onSeek: expect.any(Function),
    });

    handler?.call(instance, [], "same return");
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    expect(instance.forceUpdate).toHaveBeenCalledOnce();
  });

  it("preserves an existing onSeek handler", () => {
    let handler: Function | undefined;
    const existing = vi.fn();
    class MiniClass {
      props = { onSeek: existing };
      forceUpdate = vi.fn();
    }
    const instance = new MiniClass();
    patchMiniAchievementsRender(MiniClass, {
      afterPatch: (_target, _method, callback) => {
        handler = callback;
        return { unpatch: vi.fn() };
      },
    });

    handler?.call(instance, [], null);

    expect(instance.props.onSeek).toBe(existing);
  });

  it("fails closed when no seek controller or forceUpdate is available", () => {
    let handler: Function | undefined;
    class MiniClass {
      props: any = {};
    }
    const instance = new MiniClass();
    patchMiniAchievementsRender(MiniClass, {
      afterPatch: (_target, _method, callback) => {
        handler = callback;
        return { unpatch: vi.fn() };
      },
    });

    expect(() => handler?.call(instance, [], null)).not.toThrow();
    expect(() => instance.props.onSeek("achievements")).not.toThrow();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});

describe("installAchievementBarPatch", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.addPatch.mockImplementation((_path, callback) => callback);
    mocks.afterPatch.mockReturnValue({ unpatch: vi.fn() });
  });

  it("registers the route patch, returns props untouched, and patches once", () => {
    const document = {
      body: fiberElement({ type: MiniAchievementsSignatureDouble }),
    };
    vi.spyOn(steamGlobals, "getPopupManager").mockReturnValue({
      m_rgPopups: [popup(document, "Steam Big Picture Mode")],
    });
    const props = Object.freeze({ malformed: true });

    const dispose = installAchievementBarPatch();
    const callback = routeCallback();

    expect(mocks.addPatch).toHaveBeenCalledWith(APP_ROUTE, expect.any(Function));
    expect(callback(props)).toBe(props);
    expect(callback(props)).toBe(props);
    expect(mocks.afterPatch).toHaveBeenCalledOnce();
    expect(mocks.afterPatch).toHaveBeenCalledWith(
      MiniAchievementsSignatureDouble.prototype,
      "render",
      expect.any(Function),
    );

    const prototypePatch = mocks.afterPatch.mock.results[0].value;
    dispose();
    expect(mocks.removePatch).toHaveBeenCalledWith(APP_ROUTE, callback);
    expect(prototypePatch.unpatch).toHaveBeenCalledOnce();
  });

  it("retries capture on the next render when the class is not yet present", () => {
    const manager: any = { m_rgPopups: [] };
    vi.spyOn(steamGlobals, "getPopupManager").mockReturnValue(manager);
    installAchievementBarPatch();

    expect(routeCallback()({})).toEqual({});
    expect(mocks.afterPatch).not.toHaveBeenCalled();

    manager.m_rgPopups = [
      popup(
        { body: fiberElement({ type: MiniAchievementsSignatureDouble }) },
        "Steam Big Picture Mode",
      ),
    ];
    routeCallback()({});

    expect(mocks.afterPatch).toHaveBeenCalledOnce();
  });

  it("attempts both disposers when removePatch throws", () => {
    const document = {
      body: fiberElement({ type: MiniAchievementsSignatureDouble }),
    };
    vi.spyOn(steamGlobals, "getPopupManager").mockReturnValue({
      m_rgPopups: [popup(document)],
    });
    mocks.removePatch.mockImplementation(() => {
      throw new Error("route removal failed");
    });
    const prototypeUnpatch = vi.fn(() => {
      throw new Error("prototype removal failed");
    });
    mocks.afterPatch.mockReturnValue({ unpatch: prototypeUnpatch });

    const dispose = installAchievementBarPatch();
    routeCallback()({});

    expect(() => dispose()).not.toThrow();
    expect(mocks.removePatch).toHaveBeenCalledOnce();
    expect(prototypeUnpatch).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledTimes(2);
  });

  it("never throws on accessor/capture failures", () => {
    vi.spyOn(steamGlobals, "getPopupManager").mockImplementation(() => {
      throw new Error("Steam globals unavailable");
    });
    installAchievementBarPatch();
    const props = Object.defineProperty({}, "children", {
      get: () => {
        throw new Error("route props unavailable");
      },
    });

    expect(() => routeCallback()(props)).not.toThrow();
    expect(routeCallback()(props)).toBe(props);
    expect(mocks.afterPatch).not.toHaveBeenCalled();
  });

  it("returns a safe no-op disposer when registration fails", () => {
    mocks.addPatch.mockImplementation(() => {
      throw new Error("router unavailable");
    });

    const dispose = installAchievementBarPatch();

    expect(mocks.warn).toHaveBeenCalled();
    expect(() => dispose()).not.toThrow();
    expect(mocks.removePatch).not.toHaveBeenCalled();
  });
});
