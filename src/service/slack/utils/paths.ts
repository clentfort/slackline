import os from "node:os";
import path from "node:path";

/**
 * Returns the base directory for slackline data and configuration.
 * Can be overridden with PI_SLACKLINE_DIR (used by tests to isolate state).
 */
export function getSlacklineDir(): string {
  const override = process.env.PI_SLACKLINE_DIR?.trim();
  if (override) {
    return override;
  }

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

export function getConversationMappingsPath(): string {
  return path.join(getSlacklineDir(), "conversation-mappings.json");
}
