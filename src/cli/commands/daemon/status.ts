import type { Argv, ArgumentsCamelCase } from "yargs";
import { getSlackDaemonStatus } from "../../../service/playwright/daemon-manager.js";
import type { GlobalOptions } from "../../index.js";

export const command = "status";
export const describe = "Check the status of the Slack daemon browser";

interface StatusOptions extends GlobalOptions {}

export const builder = (yargs: Argv<GlobalOptions>) => yargs;

export async function handler(argv: ArgumentsCamelCase<StatusOptions>): Promise<void> {
  const { cdpUrl, json: asJson } = argv;

  const status = await getSlackDaemonStatus({ cdpUrl });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Running: ${status.running ? "yes" : "no"}\n`);
  process.stdout.write(`CDP URL: ${status.cdpUrl}\n`);

  if (typeof status.pid === "number") {
    process.stdout.write(`PID: ${status.pid}\n`);
  }

  if (typeof status.pidAlive === "boolean") {
    process.stdout.write(`PID alive: ${status.pidAlive ? "yes" : "no"}\n`);
  }

  if (status.profileDir) {
    process.stdout.write(`Profile dir: ${status.profileDir}\n`);
  }

  if (typeof status.headless === "boolean") {
    process.stdout.write(`Headless: ${status.headless ? "yes" : "no"}\n`);
  }
}
