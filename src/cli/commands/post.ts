import { browserOptionsFromArgv } from '../browser-options.js'
import { postMessage } from '../../service/slack/messages/post-message.js'

export const command = 'post'
export const describe = 'Post a message to a Slack channel or DM'

export const builder = (yargs: any) =>
  yargs
    .option('target', {
      alias: 't',
      type: 'string',
      demandOption: true,
      describe: 'Channel/DM name (e.g. sozial, @christian_slack.com) or full Slack URL',
    })
    .option('message', {
      alias: 'm',
      type: 'string',
      demandOption: true,
      describe: 'Message text to post',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
    })

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const workspaceUrl = String(argv.workspaceUrl)
  const target = String(argv.target)
  const message = String(argv.message)
  const asJson = Boolean(argv.json)
  const browser = browserOptionsFromArgv(argv)

  const result = await postMessage({
    workspaceUrl,
    target,
    message,
    browser,
  })

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const label = result.conversation.name ?? result.target
  const when = result.posted.timestampLabel ?? result.posted.timestampIso ?? 'just now'
  process.stdout.write(`Posted to ${label} (${result.conversation.type}) at ${when}.\n`)
}
