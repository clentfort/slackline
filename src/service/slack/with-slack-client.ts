import { withSlackContext } from "../playwright/playwright-client.js";
import { SlackClient } from "./slack-client.js";
import { getConfig } from "./config.js";

export type WithSlackClientOptions = {
  headless?: boolean;
  skipLoginCheck?: boolean;
  startRealTime?: boolean;
};

export async function withSlackClient<T>(
  options: WithSlackClientOptions = {},
  callback: (client: SlackClient) => Promise<T>,
): Promise<T> {
  const config = getConfig();
  const browser = config.browser;

  return withSlackContext(
    {
      headless: options.headless ?? true,
      ...browser,
    },
    async ({ page }) => {
      const client = new SlackClient(page);

      await client.navigateToWorkspaceRoot();

      if (!options.skipLoginCheck) {
        await client.ensureLoggedIn();
      }

      const shouldStartRealTime = options.startRealTime ?? !options.skipLoginCheck;
      if (shouldStartRealTime) {
        await client.startRealTime();
      }

      return callback(client);
    },
  );
}
