import { describe, it, expect } from "vitest";
import { browserOptionsFromArgv } from "./browser-options.js";
import type { GlobalOptions } from "./index.js";

describe("browserOptionsFromArgv", () => {
  const defaultGlobalOptions: GlobalOptions = {
    verbose: false,
    cdpUrl: "http://127.0.0.1:9222",
    json: false,
  };

  it("should correctly transform default options", () => {
    const result = browserOptionsFromArgv(defaultGlobalOptions);
    expect(result).toEqual({
      cdpUrl: "http://127.0.0.1:9222",
    });
  });

  it("should trim cdpUrl", () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      cdpUrl: "  http://localhost:9222  ",
    });
    expect(result.cdpUrl).toBe("http://localhost:9222");
  });

  it("should return undefined for empty cdpUrl after trim", () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      cdpUrl: "   ",
    });
    expect(result.cdpUrl).toBeUndefined();
  });
});
