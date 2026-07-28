// Tiny namespaced logger. Verbose logging is opt-in so normal use stays quiet.
let verbose = false;

export function setVerboseLogging(on: boolean): void {
  verbose = on;
}

const prefix = (scope: string) => `[Decky-SteamAchievements:${scope}]`;

export function debug(scope: string, ...args: unknown[]): void {
  if (verbose) console.debug(prefix(scope), ...args);
}
export function trace(scope: string, ...args: unknown[]): void {
  if (verbose) console.trace(prefix(scope), ...args);
}
export function info(scope: string, ...args: unknown[]): void {
  console.info(prefix(scope), ...args);
}
export function warn(scope: string, ...args: unknown[]): void {
  console.warn(prefix(scope), ...args);
}
export function error(scope: string, ...args: unknown[]): void {
  console.error(prefix(scope), ...args);
}
