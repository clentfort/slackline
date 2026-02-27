import { describe, it, expect } from "vitest";
import { browserOptionsFromArgv } from "./browser-options.js";
import type { GlobalOptions } from "./index.js";

describe("browserOptionsFromArgv", () => {
  const defaultGlobalOptions: GlobalOptions = {
    verbose: false,
    json: false,
  };

  it("should correctly transform default options", () => {
    const result = browserOptionsFromArgv(defaultGlobalOptions);
    expect(result).toEqual({
      chromePath: undefined,
    });
  });

  it("should include chromePath when provided", () => {
    const result = browserOptionsFromArgv({
      ...defaultGlobalOptions,
      chromePath: "/path/to/chrome",
    });
    expect(result.chromePath).toBe("/path/to/chrome");
  });
});
