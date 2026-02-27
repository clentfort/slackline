import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { SlackBrowserOptions } from "../playwright/playwright-client.js";
import { getConfigPath, getSlacklineDir } from "./utils/paths.js";

export type SlackConfig = {
  workspaceUrl?: string;
  browser: SlackBrowserOptions;
};

const defaultConfig: SlackConfig = {
  browser: {
    cdpUrl: process.env.SLACKLINE_CDP_URL ?? "http://127.0.0.1:9222",
  },
};

let currentConfig: SlackConfig | null = null;

function loadConfig(): SlackConfig {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8");
      const loaded = JSON.parse(content);
      return {
        ...defaultConfig,
        ...loaded,
        browser: {
          ...defaultConfig.browser,
          ...loaded.browser,
        },
      };
    } catch {
      // Fallback to default if corrupted
    }
  }
  return { ...defaultConfig };
}

export function saveConfig(config: SlackConfig): void {
  const configPath = getConfigPath();
  const configDir = getSlacklineDir();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function setConfig(config: Partial<SlackConfig>): void {
  const current = getConfig();
  if (config.workspaceUrl) {
    current.workspaceUrl = config.workspaceUrl;
  }
  if (config.browser) {
    current.browser = { ...current.browser, ...config.browser };
  }
  currentConfig = current;
}

export function getConfig(): SlackConfig {
  if (!currentConfig) {
    currentConfig = loadConfig();
  }
  return currentConfig;
}
