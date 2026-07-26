// Restore Valve's achievement progress bar on the app-details page by supplying
// the onSeek prop that MiniAchievements now requires. Valve's component remains
// responsible for rendering and live achievement data.

import { routerHook } from "@decky/api";
import {
  afterPatch,
  findInReactTree,
  findModuleExport,
  type Patch,
} from "@decky/ui";
import * as log from "./log";

const APP_ROUTE = "/library/app/:appid";
const ACHIEVEMENT_SEEK_SIGNATURE = 'onSeek("achievements")';
const VALVE_CLASS_KEYS = ["MiniAchievements", "GameStatsSection"] as const;

let valveClassNames: ReadonlySet<string> | undefined;

function safeDebug(...args: unknown[]): void {
  try {
    log.debug("patch", ...args);
  } catch {
    // Logging must never escape into Steam's render path.
  }
}

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

function hasOwn(value: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function sourceHasValveSignature(candidate: unknown): boolean {
  if (typeof candidate !== "function") return false;

  try {
    // Respect Steam/Decky's wrapper-preserved toString implementations so the
    // stable source signature remains visible through patched/observer types.
    const source = candidate.toString();
    return (
      source.includes(ACHIEVEMENT_SEEK_SIGNATURE) ||
      source.includes("onSeek('achievements')") ||
      VALVE_CLASS_KEYS.some(
        (key) =>
          source.includes(`.${key}`) ||
          source.includes(`["${key}"]`) ||
          source.includes(`['${key}']`),
      )
    );
  } catch {
    return false;
  }
}

function componentHasValveSignature(type: unknown): boolean {
  try {
    const component = type as any;
    const wrapped = component?.type;
    const candidates = [
      component,
      component?.render,
      component?.prototype?.render,
      wrapped,
      wrapped?.render,
      wrapped?.prototype?.render,
    ];

    return candidates.some(sourceHasValveSignature);
  } catch {
    return false;
  }
}

function resolveValveClassNames(): ReadonlySet<string> {
  if (valveClassNames) return valveClassNames;

  const resolved = new Set<string>();
  try {
    const classMap = findModuleExport((candidate: unknown) => {
      if (!candidate || typeof candidate !== "object") return false;
      return VALVE_CLASS_KEYS.every((key) => hasOwn(candidate, key));
    }) as Record<string, unknown> | undefined;

    for (const key of VALVE_CLASS_KEYS) {
      const className = classMap?.[key];
      if (typeof className === "string" && className) resolved.add(className);
    }
  } catch (error) {
    safeWarn("could not resolve Valve achievement class names", error);
  }

  valveClassNames = resolved;
  return resolved;
}

function classNameHasValveSignature(className: unknown): boolean {
  if (typeof className !== "string") return false;
  const tokens = new Set(className.split(/\s+/).filter(Boolean));

  if (VALVE_CLASS_KEYS.some((key) => tokens.has(key))) return true;
  for (const resolvedClassName of resolveValveClassNames()) {
    if (tokens.has(resolvedClassName)) return true;
  }

  return false;
}

/**
 * Match only Valve's suppressed achievement PlayBar/MiniAchievements element.
 * A Valve source/CSS signature is required before checking the prop shape.
 */
export function isSuppressedAchievementPlayBar(node: any): boolean {
  try {
    if (!node || typeof node !== "object") return false;
    const props = node.props;
    if (!props || typeof props !== "object") return false;

    const hasValveSignature =
      componentHasValveSignature(node.type) ||
      classNameHasValveSignature(props.className);
    if (!hasValveSignature) return false;

    return (
      hasOwn(props, "onSeek") &&
      hasOwn(props, "details") &&
      hasOwn(props, "overview") &&
      props.onSeek == null
    );
  } catch {
    return false;
  }
}

/** Supply onSeek only to a signature-anchored suppressed element. */
export function injectOnSeek(
  node: any,
  handler: (section: string) => void,
): boolean {
  try {
    if (!isSuppressedAchievementPlayBar(node)) return false;
    node.props.onSeek = handler;
    return node.props.onSeek === handler;
  } catch {
    return false;
  }
}

/** Install the app-details route patch and return a fail-closed disposer. */
export function installAchievementBarPatch(): () => void {
  safeInfo("installing achievement bar restore patch");

  let routePatch: any;
  let currentOwner: any;
  let currentRenderPatch: Patch | undefined;

  const onSeek = (section: string): void => {
    safeDebug("achievement stat activated", section);
  };

  const disposeCurrentRenderPatch = (): boolean => {
    if (!currentRenderPatch) {
      currentOwner = undefined;
      return true;
    }

    try {
      currentRenderPatch.unpatch();
      currentRenderPatch = undefined;
      currentOwner = undefined;
      return true;
    } catch (error) {
      safeWarn("renderFunc unpatch failed", error);
      return false;
    }
  };

  try {
    routePatch = routerHook.addPatch(APP_ROUTE, (props: any) => {
      try {
        const owner = props?.children?.props;

        if (owner !== currentOwner && !disposeCurrentRenderPatch()) {
          return props;
        }

        if (typeof owner?.renderFunc !== "function") {
          safeWarn("route renderFunc is missing or not callable");
          return props;
        }

        if (owner === currentOwner && currentRenderPatch) {
          return props;
        }

        const renderPatch = afterPatch(
          owner,
          "renderFunc",
          (_args: any[], renderedTree: any) => {
            try {
              const target = findInReactTree(
                renderedTree,
                isSuppressedAchievementPlayBar,
              );
              if (!target) {
                safeDebug("no suppressed achievement PlayBar found in rendered tree");
              } else if (!injectOnSeek(target, onSeek)) {
                safeWarn("suppressed achievement PlayBar could not be patched");
              }
            } catch (error) {
              safeWarn("rendered achievement tree patch failed", error);
            }
            return renderedTree;
          },
        );

        currentOwner = owner;
        currentRenderPatch = renderPatch;
      } catch (error) {
        safeWarn("achievement route patch failed", error);
      }

      return props;
    });
  } catch (error) {
    safeWarn("route patch registration failed", error);
  }

  return () => {
    if (routePatch) {
      try {
        routerHook.removePatch(APP_ROUTE, routePatch);
      } catch (error) {
        safeWarn("removePatch failed", error);
      }
    }

    disposeCurrentRenderPatch();
    safeInfo("achievement bar patch removed");
  };
}
