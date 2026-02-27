import type { Argv, ArgumentsCamelCase } from "yargs";
import { loginToSlack } from "../../../service/slack/auth/login.js";
import { startSlackDaemon } from "../../../service/playwright/daemon-manager.js";
import { setConfig, getConfig, saveConfig } from "../../../service/slack/config.js";
import type { GlobalOptions } from "../../index.js";

export const command = "login <workspace-url>";
export const describe = "Interactive login to Slack to establish a session";

interface LoginOptions extends GlobalOptions {
  workspaceUrl: string;
  timeoutSeconds: number;
  manualConfirm: boolean;
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .positional("workspace-url", {
      type: "string",
      describe: "Slack workspace URL (e.g. https://myteam.slack.com)",
      demandOption: true,
    })
    .option("timeout-seconds", {
      type: "number",
      default: 300,
      describe: "How long to wait for manual login completion",
    })
    .option("manual-confirm", {
      type: "boolean",
      default: true,
      describe: "Wait for Enter confirmation in terminal before verifying login",
    });

export async function handler(argv: ArgumentsCamelCase<LoginOptions>): Promise<void> {
  const { cdpUrl, timeoutSeconds, manualConfirm, chromePath } = argv;
  let { workspaceUrl } = argv;

  // Basic validation and protocol addition
  if (!workspaceUrl.startsWith("http://") && !workspaceUrl.startsWith("https://")) {
    workspaceUrl = `https://${workspaceUrl}`;
  }

  try {
    const url = new URL(workspaceUrl);
    if (!url.hostname.endsWith(".slack.com")) {
      throw new Error("Invalid workspace URL. It must be a Slack workspace (e.g., https://name.slack.com)");
    }
    workspaceUrl = `${url.protocol}//${url.hostname}/`;
  } catch (error) {
    throw new Error(`Invalid URL: ${workspaceUrl}. ${error instanceof Error ? error.message : ""}`);
  }

  // Set the workspace URL in config (in-memory for now)
  setConfig({ workspaceUrl });

  // Ensure the daemon is running in headed mode for interactive login
  await startSlackDaemon({
    cdpUrl,
    headless: false,
    chromePath,
  });

  process.stdout.write(
    `Opening Slack login window for ${workspaceUrl}. Complete login in browser and keep it open until CLI confirms.\n`,
  );
  await loginToSlack({ timeoutSeconds, manualConfirm });

  // Persist the workspace URL to the config file upon successful login
  saveConfig(getConfig());

  process.stdout.write("Login flow completed. Persistent browser profile is ready.\n");

  // Switch back to headless mode after login
  await startSlackDaemon({
    cdpUrl,
    headless: true,
    chromePath,
  });
}
