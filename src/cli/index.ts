import { fileURLToPath } from 'node:url'

import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import type { Argv } from 'yargs'

import { defaultSlackWorkspaceUrl } from '../service/slack/defaults.js'
import { setConfig } from '../service/slack/config.js'
import { browserOptionsFromArgv } from './browser-options.js'

export interface GlobalOptions {
  verbose: boolean
  workspaceUrl: string
  cdpUrl: string
  json: boolean
  chromePath?: string
}

export function createParser(options: { skipCommandDir?: boolean } = {}): Argv<GlobalOptions> {
  const commandsDir = fileURLToPath(new URL('./commands', import.meta.url))

  const parser = yargs()
    .scriptName('slackline')
    .env('SLACKLINE')
    .option('verbose', {
      type: 'boolean',
      default: false,
      describe: 'Enable verbose CLI logging',
      global: true,
    })
    .option('workspaceUrl', {
      alias: 'workspace-url',
      type: 'string',
      describe: 'Slack workspace/channel URL to use as entry point',
      default: defaultSlackWorkspaceUrl,
      global: true,
    })
    .option('cdpUrl', {
      alias: 'cdp-url',
      type: 'string',
      default: 'http://127.0.0.1:9222',
      describe: 'CDP endpoint URL for the browser daemon',
      global: true,
    })
    .option('chromePath', {
      alias: 'chrome-path',
      type: 'string',
      describe: 'Path to Chrome executable',
      global: true,
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
      global: true,
    })

  if (!options.skipCommandDir) {
    parser.commandDir(commandsDir, {
      extensions: ['js', 'ts'],
      exclude: /\.test\.(ts|js)$/,
    })
  }

  parser.middleware((argv) => {
      setConfig({
        workspaceUrl: argv.workspaceUrl as string,
        browser: browserOptionsFromArgv(argv as unknown as GlobalOptions),
      })
    })
    .demandCommand(1, 'Provide a command')
    .strict()
    .help()

  return parser as unknown as Argv<GlobalOptions>
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const parser = createParser().fail((message: string, error: Error | undefined, yargsInstance) => {
    if (error) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }

    process.stderr.write(`${message}\n`)
    yargsInstance.showHelp()
    process.exit(1)
  })

  await parser.parseAsync(hideBin(argv))
}

const thisFilePath = fileURLToPath(import.meta.url)
const entryArgPath = process.argv[1]

if (entryArgPath && thisFilePath === entryArgPath) {
  run(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exit(1)
  })
}
