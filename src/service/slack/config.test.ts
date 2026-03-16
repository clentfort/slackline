import { describe, it, expect, beforeEach } from "vitest";
import { getConfig, resetConfigForTests, setConfig } from "./config.js";

describe("config", () => {
  beforeEach(() => {
    resetConfigForTests();
  });

  it("should have default values", () => {
    const config = getConfig();
    expect(config.workspaceUrl).toBeUndefined();
    expect(config.browser).toBeDefined();
  });

  it("should update config via setConfig", () => {
    const newUrl = "https://custom.slack.com";
    setConfig({ workspaceUrl: newUrl });
    expect(getConfig().workspaceUrl).toBe(newUrl);
  });

  it("should update browser options partially", () => {
    const newCdpUrl = "http://localhost:9999";
    setConfig({ browser: { cdpUrl: newCdpUrl } });
    const config = getConfig();
    expect(config.browser.cdpUrl).toBe(newCdpUrl);
  });
});
