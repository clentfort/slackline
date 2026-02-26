import type { Argv, ArgumentsCamelCase } from "yargs";
import type { GlobalOptions } from "../../index.js";
import { withSlackClient } from "../../../service/slack/with-slack-client.js";
import { setupWebhookForwarding } from "./webhook-forwarder.js";
import { notificationInjectionScript } from "../../../service/slack/notifications/browser-scripts.js";

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

  if (!verbose) {
    await withSlackClient({ skipLoginCheck: false, keepContextOpen: true }, async (client) => {
      process.stdout.write(`Attaching persistent listener to Slack page for ${webhook}...\n`);
      // Add init script to survive reloads and apply to new pages
      await client.page.context().addInitScript(notificationInjectionScript, webhook);
      // Reload to ensure the hook is active for the current page
      await client.page.reload({ waitUntil: "domcontentloaded" });
      process.stdout.write("Listener attached and page reloaded. You can exit now.\n");
    });
    return;
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
