import { browserOptionsFromArgv } from '../browser-options.js'
import { getRecentMessages } from '../../service/slack/messages/get-recent-messages.js'

export const command = 'messages'
export const aliases = ['tail']
export const describe = 'Get the latest messages from a channel or DM'

export const builder = (yargs: any) =>
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

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const workspaceUrl = String(argv.workspaceUrl)
  const target = String(argv.target)
  const limit = Number(argv.limit)
  const asJson = Boolean(argv.json)
  const browser = browserOptionsFromArgv(argv)

  const result = await getRecentMessages({
    workspaceUrl,
    target,
    limit,
    browser,
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
