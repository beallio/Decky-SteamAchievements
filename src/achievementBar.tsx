// Restore Valve's achievement progress bar without remounting any app-details
// components. The MiniAchievements class is captured read-only from the Big
// Picture fiber tree, then its own render method is patched to supply onSeek.

import { routerHook } from "@decky/api";
import { afterPatch } from "@decky/ui";
import * as log from "./log";

const APP_ROUTE = "/library/app/:appid";
const MAX_ANCESTOR_DEPTH = 2_000;
const MAX_FIBER_NODES = 300_000;
const MAX_FIBER_ANCHORS = 2_000;
const INSTANCE_PATCH_FLAG = "__achRestored";

type SeekHandler = (section: string) => void;
type PrototypePatch = { unpatch: () => void };
type MiniAchievementsCapture = {
  MiniClass: any | undefined;
  instances: any[];
};
type AfterPatch = (
  target: any,
  method: string,
  handler: (this: any, args: any[], result: any) => any,
) => PrototypePatch;

function safeInfo(...args: unknown[]): void {
  try {
    log.info("patch", ...args);
  } catch {
    // Logging must never make installation or cleanup fail.
  }
}

function safeWarn(...args: unknown[]): void {
  try {
    log.warn("patch", ...args);
  } catch {
    // Logging must never escape into Steam's render path.
  }
}

/** Match MiniAchievements by the stable source signature in its class body. */
export function hasAchievementRenderSignature(type: unknown): boolean {
  if (typeof type !== "function") return false;

  try {
    const source = type.toString();
    return (
      source.includes('onSeek("achievements")') ||
      source.includes("onSeek('achievements')")
    );
  } catch {
    return false;
  }
}

/** Supply onSeek without replacing a non-null handler already provided by Valve. */
export function withOnSeek(props: any, handler: SeekHandler): any {
  if (props === null || typeof props !== "object") return props;

  try {
    if (props.onSeek != null) return props;
    return { ...props, onSeek: handler };
  } catch {
    return props;
  }
}

/** Find the nearest ancestor state node matching a stable capability predicate. */
export function findAncestorStateNode(
  fiber: any,
  predicate: (stateNode: any) => boolean,
  maxDepth = MAX_ANCESTOR_DEPTH,
): any | undefined {
  try {
    let current = fiber;
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      const stateNode = current.stateNode;
      if (stateNode != null && predicate(stateNode)) return stateNode;
      current = current.return;
    }
  } catch {
    // Fibers are Steam internals and may change while the tree is inspected.
  }

  return undefined;
}

/** Bounded, read-only DFS over React fiber child/sibling links. */
export function findClassInFiberTree(
  rootFiber: any,
  predicate: (type: any) => boolean,
  maxNodes = MAX_FIBER_NODES,
): any | undefined {
  if (!rootFiber || maxNodes <= 0) return undefined;

  try {
    const stack = [rootFiber];
    let visited = 0;

    while (stack.length > 0 && visited < maxNodes) {
      const fiber = stack.pop();
      if (!fiber) continue;
      visited += 1;

      const type = fiber.elementType || fiber.type;
      if (type && predicate(type)) return type;

      // Push sibling first so the child is visited first.
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
  } catch {
    // Fail closed if a live fiber is detached or exposes a throwing getter.
  }

  return undefined;
}

function getFiberFromElement(element: any): any | undefined {
  if (!element) return undefined;

  try {
    const key = Object.keys(element).find(
      (candidate) =>
        candidate.startsWith("__reactFiber$") ||
        candidate.startsWith("__reactContainer$"),
    );
    return key ? element[key] : undefined;
  } catch {
    return undefined;
  }
}

function getFiberFromDocument(document: any): any | undefined {
  try {
    const bodyFiber = getFiberFromElement(document?.body);
    if (bodyFiber) return bodyFiber;

    if (typeof document?.querySelectorAll !== "function") return undefined;
    const elements = document.querySelectorAll("*");
    let inspected = 0;
    for (const element of elements ?? []) {
      if (inspected >= MAX_FIBER_ANCHORS) break;
      inspected += 1;
      const fiber = getFiberFromElement(element);
      if (fiber) return fiber;
    }
  } catch {
    // Popup documents can disappear during navigation.
  }

  return undefined;
}

function popupValues(collection: any): any[] {
  try {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (typeof collection.values === "function") {
      return Array.from(collection.values());
    }
    if (typeof collection[Symbol.iterator] === "function") {
      return Array.from(collection);
    }
  } catch {
    // Treat malformed popup collections as empty.
  }

  return [];
}

function isBigPicturePopup(popup: any, document: any): boolean {
  try {
    const titles = [
      popup?.m_strTitle,
      popup?.title,
      popup?.m_popup?.name,
      document?.title,
    ];
    return titles.some((title) => title === "Steam Big Picture Mode");
  } catch {
    return false;
  }
}

/**
 * Locate the app-details document from SharedJSContext's popup manager.
 * Prefer the named BPM popup, but accept any popup with a readable fiber.
 */
export function getBigPictureDocument(popupManager: any): any | undefined {
  try {
    const collection =
      popupManager?.m_rgPopups ??
      (typeof popupManager?.GetPopups === "function"
        ? popupManager.GetPopups()
        : undefined);
    const candidates: Array<{ document: any; isBigPicture: boolean }> = [];

    for (const popup of popupValues(collection)) {
      try {
        const document = popup?.m_popup?.document;
        if (!document || !getFiberFromDocument(document)) continue;
        candidates.push({
          document,
          isBigPicture: isBigPicturePopup(popup, document),
        });
      } catch {
        // Skip individual popups that are closing or malformed.
      }
    }

    return (
      candidates.find((candidate) => candidate.isBigPicture)?.document ??
      candidates[0]?.document
    );
  } catch {
    return undefined;
  }
}

/**
 * Capture MiniAchievements and its mounted instances from the live BPM fiber
 * tree without wrapping or mutating the tree.
 */
export function captureMiniAchievements(
  popupManager: any,
): MiniAchievementsCapture {
  try {
    const document = getBigPictureDocument(popupManager);
    let rootFiber = getFiberFromDocument(document);
    if (!rootFiber) return { MiniClass: undefined, instances: [] };

    for (
      let depth = 0;
      rootFiber?.return && depth < MAX_ANCESTOR_DEPTH;
      depth += 1
    ) {
      rootFiber = rootFiber.return;
    }

    const stack = [rootFiber];
    const instances: any[] = [];
    const seenInstances = new Set<any>();
    let MiniClass: any | undefined;
    let visited = 0;

    while (stack.length > 0 && visited < MAX_FIBER_NODES) {
      const fiber = stack.pop();
      if (!fiber) continue;
      visited += 1;

      const type = fiber.elementType || fiber.type;
      if (type && hasAchievementRenderSignature(type)) {
        MiniClass ??= type;
        const instance = fiber.stateNode;
        if (instance != null && !seenInstances.has(instance)) {
          seenInstances.add(instance);
          instances.push(instance);
        }
      }

      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }

    return { MiniClass, instances };
  } catch {
    return { MiniClass: undefined, instances: [] };
  }
}

/** Resolve Valve's app-details section-seek controller from an instance fiber. */
export function resolveSeekController(instance: any): any | undefined {
  try {
    const fiber =
      instance?._reactInternals ?? instance?._reactInternalFiber;
    return findAncestorStateNode(
      fiber,
      (stateNode) => typeof stateNode?.SeekToSection === "function",
    );
  } catch {
    return undefined;
  }
}

/** Supply durable props to one mounted MiniAchievements instance and refresh it. */
export function restoreInstance(instance: any): void {
  try {
    if (
      !instance ||
      Object.prototype.hasOwnProperty.call(instance, INSTANCE_PATCH_FLAG)
    ) {
      return;
    }

    const onSeek: SeekHandler = (section) => {
      try {
        const controller = resolveSeekController(instance);
        const seek = controller?.SeekToSection;
        if (typeof seek === "function") {
          seek.call(controller, section);
        }
      } catch {
        // Native currently has no achievements target; activation no-ops.
      }
    };
    let store = withOnSeek(instance.props, onSeek);

    Object.defineProperty(instance, "props", {
      configurable: true,
      get: () => store,
      set: (value) => {
        store = withOnSeek(value, onSeek);
      },
    });
    Object.defineProperty(instance, INSTANCE_PATCH_FLAG, {
      configurable: true,
      value: true,
    });

    setTimeout(() => {
      try {
        if (typeof instance.forceUpdate === "function") {
          instance.forceUpdate();
        }
      } catch {
        // A detached instance is harmless; never throw into Steam.
      }
    }, 0);
  } catch {
    // A malformed or detached instance must never break the Steam UI.
  }
}

/**
 * Patch MiniAchievements.prototype.render without wrapping/remounting the class.
 * The first intercepted render installs durable props and queues a fresh commit.
 */
export function patchMiniAchievementsRender(
  MiniClass: any,
  dependencies: { afterPatch: AfterPatch },
): PrototypePatch | undefined {
  try {
    return dependencies.afterPatch(
      MiniClass.prototype,
      "render",
      function (this: any, _args: any[], result: any): any {
        restoreInstance(this);
        return result;
      },
    );
  } catch (error) {
    safeWarn("MiniAchievements render patch failed", error);
    return undefined;
  }
}

/** Injectable Steam-global boundary used by the route callback. */
export const steamGlobals = {
  getPopupManager(): any | undefined {
    try {
      return (window as any)?.g_PopupManager;
    } catch {
      return undefined;
    }
  },
};

/** Install the app-details capture trigger and return a fail-closed disposer. */
export function installAchievementBarPatch(): () => void {
  safeInfo("installing achievement bar restore patch");

  let routePatch: any;
  let prototypePatch: PrototypePatch | undefined;
  let attemptScheduled = false;
  let attemptTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const attemptCaptureAndPatch = (): void => {
    try {
      if (disposed || prototypePatch) return;

      const { MiniClass, instances } = captureMiniAchievements(
        steamGlobals.getPopupManager(),
      );
      if (!MiniClass) return;

      const patch = patchMiniAchievementsRender(MiniClass, {
        afterPatch: afterPatch as AfterPatch,
      });
      if (!patch) return;

      prototypePatch = patch;
      for (const instance of instances) {
        restoreInstance(instance);
      }
    } catch (error) {
      safeWarn("achievement class capture failed", error);
    }
  };

  try {
    routePatch = routerHook.addPatch(APP_ROUTE, (props: any) => {
      try {
        if (!disposed && !prototypePatch && !attemptScheduled) {
          attemptScheduled = true;
          attemptTimer = setTimeout(() => {
            attemptTimer = undefined;
            attemptScheduled = false;
            attemptCaptureAndPatch();
          }, 0);
        }
      } catch (error) {
        attemptScheduled = false;
        attemptTimer = undefined;
        safeWarn("achievement class capture scheduling failed", error);
      }

      return props;
    });
  } catch (error) {
    safeWarn("route patch registration failed", error);
  }

  return () => {
    disposed = true;

    if (attemptTimer !== undefined) {
      try {
        clearTimeout(attemptTimer);
      } catch (error) {
        safeWarn("capture timer cleanup failed", error);
      }
      attemptTimer = undefined;
      attemptScheduled = false;
    }

    if (routePatch) {
      try {
        routerHook.removePatch(APP_ROUTE, routePatch);
      } catch (error) {
        safeWarn("removePatch failed", error);
      }
    }

    if (prototypePatch) {
      try {
        prototypePatch.unpatch();
      } catch (error) {
        safeWarn("prototype unpatch failed", error);
      }
    }

    safeInfo("achievement bar patch removed");
  };
}
