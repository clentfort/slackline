import os from "node:os";
import path from "node:path";

/**
 * Returns the base directory for slackline data and configuration.
 * For now, we use ~/.config/slackline across all platforms as requested.
 */
export function getSlacklineDir(): string {
  return path.join(os.homedir(), ".config", "slackline");
}

export function getConfigPath(): string {
  return path.join(getSlacklineDir(), "config.json");
}

export function getDaemonStatePath(): string {
  return path.join(getSlacklineDir(), "daemon-state.json");
}

export function getChromeProfileDir(): string {
  return path.join(getSlacklineDir(), "chrome-profile");
}
