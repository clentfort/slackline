import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Argv, ArgumentsCamelCase } from "yargs";
import { stateDir } from "../../../service/playwright/daemon-manager.js";
import type { GlobalOptions } from "../../index.js";
import { withSlackClient } from "../../../service/slack/with-slack-client.js";
import { setupWebhookForwarding } from "./webhook-forwarder.js";

export const command = "listen <webhook>";
export const describe = "Listen for Slack events and forward them to a webhook";

interface ListenOptions extends GlobalOptions {
  webhook: string;
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs.positional("webhook", {
    type: "string",
    describe: "Webhook URL to forward notifications to",
    demandOption: true,
  });

export async function handler(argv: ArgumentsCamelCase<ListenOptions>): Promise<void> {
  const { json: asJson, webhook, verbose } = argv;

  const isBackground = process.env.SLACKLINE_BACKGROUND === "true";

  if (!verbose && !isBackground) {
    const pidPath = path.resolve(stateDir, "listener.pid");

    await mkdir(stateDir, { recursive: true });

    const child = spawn(process.argv[0], [...process.argv.slice(1)], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        SLACKLINE_BACKGROUND: "true",
      },
    });

    if (child.pid) {
      await writeFile(pidPath, child.pid.toString(), "utf8");
      process.stdout.write(`Listener started in background (PID: ${child.pid})\n`);
    }

    child.unref();
    process.exit(0);
  }

  await withSlackClient({ skipLoginCheck: false }, async (client) => {
    if (verbose) {
      process.stdout.write(`Listening for Slack events and forwarding to ${webhook}...\n`);
      process.stdout.write("Press Ctrl+C to stop.\n");
    }

    setupWebhookForwarding(client.events, webhook, {
      verbose: verbose,
      onEvent: (event) => {
        if (!verbose) return;
        const timestamp = new Date().toISOString();
        if (asJson) {
          process.stdout.write(`${JSON.stringify({ timestamp, ...event })}\n`);
        } else {
          process.stdout.write(`[${timestamp}] Notification: ${event.data.title}\n`);
        }
      },
      onError: (err) => {
        if (verbose) {
          process.stderr.write(`Failed to send webhook: ${err.message}\n`);
        }
      },
    });

    await client.notifications.listen();

    // Keep the process running until interrupted
    return new Promise<void>((resolve) => {
      const keepAlive = setInterval(() => {}, 60_000);

      const stop = () => {
        clearInterval(keepAlive);
        if (verbose) {
          process.stdout.write("\nStopping listener...\n");
        }
        process.off("SIGINT", onSigInt);
        process.off("SIGTERM", onSigTerm);
        resolve();
      };

      const onSigInt = () => {
        stop();
      };

      const onSigTerm = () => {
        stop();
      };

      process.on("SIGINT", onSigInt);
      process.on("SIGTERM", onSigTerm);
    });
  });
}
