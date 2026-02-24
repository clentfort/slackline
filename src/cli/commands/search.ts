import type { Argv, ArgumentsCamelCase } from 'yargs'
import { searchSlack } from '../../service/slack/search/search-slack.js'
import type { GlobalOptions } from '../index.js'

export const command = 'search'
export const describe = 'Search Slack messages via Playwright automation'

interface SearchOptions extends GlobalOptions {
  query: string
  limit: number
  json: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
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

export async function handler(argv: ArgumentsCamelCase<SearchOptions>): Promise<void> {
  const { query, limit, json: asJson } = argv

  const result = await searchSlack({
    query,
    limit,
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
