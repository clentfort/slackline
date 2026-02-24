import { fileURLToPath } from 'node:url'

import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'

import { defaultSlackWorkspaceUrl } from '../service/slack/defaults.js'
import { setConfig } from '../service/slack/config.js'
import { browserOptionsFromArgv } from './browser-options.js'

export async function run(argv: string[] = process.argv): Promise<void> {
  const commandsDir = fileURLToPath(new URL('./commands', import.meta.url))

  const cli = yargs(hideBin(argv))
    .scriptName('slackline')
    .env('SLACKLINE')
    .option('verbose', {
      type: 'boolean',
      default: false,
      describe: 'Enable verbose CLI logging',
      global: true,
    })
    .option('workspace-url', {
      type: 'string',
      describe: 'Slack workspace/channel URL to use as entry point',
      default: defaultSlackWorkspaceUrl,
      global: true,
    })
    .option('browser-mode', {
      type: 'string',
      choices: ['persistent', 'attach', 'daemon'],
      default: 'persistent',
      describe: 'Browser execution mode',
      global: true,
    })
    .option('browser', {
      type: 'string',
      choices: ['chrome', 'firefox'],
      default: 'chrome',
      describe: 'Browser engine for persistent mode',
      global: true,
    })
    .option('cdp-url', {
      type: 'string',
      default: 'http://127.0.0.1:9222',
      describe: 'CDP endpoint URL for attach/daemon mode',
      global: true,
    })
    .commandDir(commandsDir, {
      extensions: ['js', 'ts'],
      exclude: /\.test\.(ts|js)$/,
    })
    .middleware((argv) => {
      setConfig({
        workspaceUrl: argv.workspaceUrl as string,
        browser: browserOptionsFromArgv(argv),
      })
    })

  await cli
    .demandCommand(1, 'Provide a command')
    .strict()
    .help()
    .fail((message: string, error: Error | undefined, yargsInstance) => {
      if (error) {
        process.stderr.write(`${error.message}\n`)
        process.exit(1)
      }

      process.stderr.write(`${message}\n`)
      yargsInstance.showHelp()
      process.exit(1)
    })
    .parseAsync()
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
