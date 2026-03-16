import type { Argv, ArgumentsCamelCase } from "yargs";
import { getRecentMessages } from "../../service/slack/messages/get-recent-messages.js";
import type { GlobalOptions } from "../index.js";

export const command = "messages <target>";
export const aliases = ["tail"];
export const describe = "Get the latest messages from a channel or DM";

interface MessagesOptions extends GlobalOptions {
  target: string;
  limit: number;
  before: number;
  after: number;
  thread: boolean;
  threadLimit: number;
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .positional("target", {
      type: "string",
      describe: "Channel/DM name (e.g. sozial, @christian_slack.com) or full Slack URL",
    })
    .option("limit", {
      alias: "n",
      type: "number",
      default: 20,
      describe: "How many recent messages to return (latest first)",
    })
    .option("before", {
      type: "number",
      default: 2,
      describe: "For Slack permalinks: how many messages before the target message",
    })
    .option("after", {
      type: "number",
      default: 2,
      describe: "For Slack permalinks: how many messages after the target message",
    })
    .option("thread", {
      type: "boolean",
      default: false,
      describe: "For Slack permalinks: include visible thread messages",
    })
    .option("thread-limit", {
      type: "number",
      default: 40,
      describe: "For Slack permalinks: max thread messages to load",
    });

export async function handler(argv: ArgumentsCamelCase<MessagesOptions>): Promise<void> {
  const { target, limit, before, after, thread, threadLimit, json: asJson } = argv;

  const result = await getRecentMessages({
    target,
    limit,
    before,
    after,
    includeThread: thread,
    threadLimit,
  });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const label = result.conversation.name ?? result.target;
  process.stdout.write(`Conversation: ${label} (${result.conversation.type})\n`);

  if (result.permalink) {
    const focused = result.focused;
    process.stdout.write(`Permalink: ${result.permalink.url}\n`);

    if (!focused?.targetFound) {
      process.stdout.write("Target message not found in current loaded viewport.\n");
    }

    process.stdout.write(
      `Context messages: ${result.messages.length} (${focused?.before.length ?? 0} before, ${focused?.after.length ?? 0} after)\n`,
    );

    for (const message of result.messages) {
      const user = message.user ?? "unknown-user";
      const when = message.timestampLabel ?? message.timestampIso ?? "unknown-time";
      const isTarget = focused?.targetMessage
        ? message.timestampUnix === focused.targetMessage.timestampUnix &&
          message.text === focused.targetMessage.text
        : false;
      const prefix = isTarget ? ">" : "-";
      process.stdout.write(`${prefix} ${when} | ${user} | ${message.text}\n`);
    }

    if (thread) {
      const threadMessages = focused?.threadMessages ?? [];
      process.stdout.write(`Thread messages: ${threadMessages.length}\n`);
      for (const message of threadMessages) {
        const user = message.user ?? "unknown-user";
        const when = message.timestampLabel ?? message.timestampIso ?? "unknown-time";
        process.stdout.write(`* ${when} | ${user} | ${message.text}\n`);
      }
    }

    return;
  }

  process.stdout.write(`Messages: ${result.messages.length} (latest first)\n`);

  if (result.messages.length === 0) {
    process.stdout.write("No visible messages found in current viewport.\n");
    return;
  }

  for (const message of result.messages) {
    const user = message.user ?? "unknown-user";
    const when = message.timestampLabel ?? message.timestampIso ?? "unknown-time";
    process.stdout.write(`- ${when} | ${user} | ${message.text}\n`);
  }
}
