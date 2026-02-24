import type { Argv, ArgumentsCamelCase } from 'yargs'
import { getRecentMessages } from '../../service/slack/messages/get-recent-messages.js'
import type { GlobalOptions } from '../index.js'

export const command = 'messages'
export const aliases = ['tail']
export const describe = 'Get the latest messages from a channel or DM'

interface MessagesOptions extends GlobalOptions {
  target: string
  limit: number
  json: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .option('target', {
      alias: 't',
      type: 'string',
      demandOption: true,
      describe: 'Channel/DM name (e.g. sozial, @christian_slack.com) or full Slack URL',
    })
    .option('limit', {
      alias: 'n',
      type: 'number',
      default: 20,
      describe: 'How many recent messages to return (latest first)',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
    })

export async function handler(argv: ArgumentsCamelCase<MessagesOptions>): Promise<void> {
  const { target, limit, json: asJson } = argv

  const result = await getRecentMessages({
    target,
    limit,
  })

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const label = result.conversation.name ?? result.target
  process.stdout.write(`Conversation: ${label} (${result.conversation.type})\n`)
  process.stdout.write(`Messages: ${result.messages.length} (latest first)\n`)

  if (result.messages.length === 0) {
    process.stdout.write('No visible messages found in current viewport.\n')
    return
  }

  for (const message of result.messages) {
    const user = message.user ?? 'unknown-user'
    const when = message.timestampLabel ?? message.timestampIso ?? 'unknown-time'
    process.stdout.write(`- ${when} | ${user} | ${message.text}\n`)
  }
}
