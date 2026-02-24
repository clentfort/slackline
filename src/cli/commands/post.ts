import type { Argv, ArgumentsCamelCase } from 'yargs'
import { postMessage } from '../../service/slack/messages/post-message.js'
import type { GlobalOptions } from '../index.js'

export const command = 'post'
export const describe = 'Post a message to a Slack channel or DM'

interface PostOptions extends GlobalOptions {
  target: string
  message: string
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

export async function handler(argv: ArgumentsCamelCase<PostOptions>): Promise<void> {
  const { target, message, json: asJson } = argv

  const result = await postMessage({
    target,
    message,
  })

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const label = result.conversation.name ?? result.target
  const when = result.posted.timestampLabel ?? result.posted.timestampIso ?? 'just now'
  process.stdout.write(`Posted to ${label} (${result.conversation.type}) at ${when}.\n`)
}
