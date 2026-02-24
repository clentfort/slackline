import type { Argv, ArgumentsCamelCase } from "yargs";
import type { GlobalOptions } from "../../index.js";
import { withSlackClient } from "../../../service/slack/with-slack-client.js";

export const command = "listen";
export const describe = "Listen for Slack events and forward them to a webhook";

interface ListenOptions extends GlobalOptions {
  webhook: string;
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs.option("webhook", {
    type: "string",
    demandOption: true,
    describe: "Webhook URL to forward notifications to",
  });

export async function handler(argv: ArgumentsCamelCase<ListenOptions>): Promise<void> {
  const { json: asJson, webhook } = argv;

  await withSlackClient({ skipLoginCheck: false }, async (client) => {
    process.stdout.write(`Listening for Slack events and forwarding to ${webhook}...\n`);
    process.stdout.write("Press Ctrl+C to stop.\n");

    await client.notifications.startWebhookForwarder(webhook, {
      verbose: true,
      onEvent: (event) => {
        const timestamp = new Date().toISOString();
        if (asJson) {
          process.stdout.write(`${JSON.stringify({ timestamp, ...event })}\n`);
        } else {
          if (event.type === "notification") {
            process.stdout.write(`[${timestamp}] Notification: ${event.data.title}\n`);
          } else {
            process.stdout.write(`[${timestamp}] Title changed: ${event.data.title}\n`);
          }
        }
      },
      onError: (err) => {
        process.stderr.write(`Failed to send webhook: ${err.message}\n`);
      },
    });

    // Keep the process running until interrupted
    return new Promise<void>((resolve) => {
      const onSigInt = () => {
        process.stdout.write("\nStopping listener...\n");
        process.off("SIGINT", onSigInt);
        resolve();
      };
      process.on("SIGINT", onSigInt);
    });
  });
}
