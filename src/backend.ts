import { callable } from "@decky/api";

export type PluginSettings = {
  feature_enabled: boolean;
  debug_logging: boolean;
};

export type Versions = {
  plugin: string;
  decky: string;
  steamos: string;
};

export const getSettings = callable<[], PluginSettings>("get_settings");
export const setFeatureEnabled = callable<[boolean], PluginSettings>(
  "set_feature_enabled",
);
export const setDebugLogging = callable<[boolean], PluginSettings>(
  "set_debug_logging",
);
export const getVersions = callable<[], Versions>("get_versions");
