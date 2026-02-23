import type { CommandModule } from 'yargs'

import { browserOptionsFromArgv } from '../browser-options.js'
import { searchSlack } from '../../service/slack/search/search-slack.js'

export const command = 'search'
export const describe = 'Search Slack messages via Playwright automation'

export const builder: CommandModule['builder'] = (yargs) =>
  yargs
    .option('query', {
      alias: 'q',
      type: 'string',
      demandOption: true,
      describe: 'Search query text',
    })
    .option('limit', {
      type: 'number',
      default: 10,
      describe: 'Maximum number of matches to print',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
    })

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const workspaceUrl = String(argv.workspaceUrl)
  const query = String(argv.query)
  const limit = Number(argv.limit)
  const asJson = Boolean(argv.json)
  const browser = browserOptionsFromArgv(argv)

  const result = await searchSlack({
    workspaceUrl,
    query,
    limit,
    browser,
  })

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  process.stdout.write(`Query: ${result.query}\n`)
  process.stdout.write(`Matches: ${result.results.length}\n`)

  if (result.results.length === 0) {
    process.stdout.write('No matches found.\n')
    return
  }

  for (const item of result.results) {
    const channel = item.channel ?? 'unknown-channel'
    const user = item.user ?? 'unknown-user'
    const when = item.timestampLabel ?? item.timestampIso ?? 'unknown-time'
    process.stdout.write(`- [${channel}] ${user} | ${when} | ${item.message}\n`)
  }
}
