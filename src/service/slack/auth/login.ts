import { createInterface } from "node:readline/promises";

import { withSlackClient } from "../with-slack-client.js";
import { getSlackProfile } from "../profile/get-profile.js";
import { isLoggedInContext } from "../session/session-state.js";

type LoginOptions = {
  timeoutSeconds: number;
  manualConfirm: boolean;
};

export async function loginToSlack(options: LoginOptions): Promise<void> {
  const timeoutMs = Math.max(10, options.timeoutSeconds) * 1000;
  let closedBeforeDetection = false;

  let detected = false;

  try {
    detected = await withSlackClient(
      {
        headless: false,
        skipLoginCheck: true,
      },
      async (client) => {
        if (options.manualConfirm && process.stdin.isTTY) {
          return waitForManualConfirmation(client.page.context(), timeoutMs);
        }

        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
          if (await isLoggedInContext(client.page.context(), 1200)) {
            return true;
          }

          await delay(500);
        }

        return false;
      },
    );
  } catch (error) {
    if (!isClosedError(error)) {
      throw error;
    }
    closedBeforeDetection = true;
  }

  if (detected) {
    return;
  }

  const profile = await getSlackProfile();
  if (profile.loggedIn) {
    return;
  }

  if (closedBeforeDetection) {
    throw new Error(
      "Browser window was closed before login could be verified. Re-run `slackline auth login` and keep the window open until completion.",
    );
  }

  throw new Error(
    "Login was not detected before timeout. Keep the browser window open until Slack workspace UI loads, then run `slackline whoami` to verify.",
  );
}

async function waitForManualConfirmation(
  context: import("playwright").BrowserContext,
  timeoutMs: number,
): Promise<boolean> {
  process.stdout.write("Complete login in the browser window.\n");
  process.stdout.write("When Slack is ready, press Enter here to verify.\n");

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    const answer = await promptLine(
      `Press Enter to verify login (${remainingSeconds}s left), or type q to cancel: `,
    );

    if (answer.trim().toLowerCase() === "q") {
      return false;
    }

    if (await isLoggedInContext(context, 1200)) {
      return true;
    }

    process.stdout.write("Still not detected. Finish login in browser, then press Enter again.\n");
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function isClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Target page, context or browser has been closed/i.test(error.message);
}
