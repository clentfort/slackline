import type { SlackBrowserOptions } from "../service/playwright/playwright-client.js";
import type { GlobalOptions } from "./index.js";

export function browserOptionsFromArgv(argv: GlobalOptions): SlackBrowserOptions {
  return {
    chromePath: argv.chromePath?.trim() || undefined,
  };
}
