import type { Argv, ArgumentsCamelCase } from 'yargs'
import {
  startSlackDaemon,
  type SlackDaemonStatus,
} from '../../../service/playwright/daemon-manager.js'
import type { GlobalOptions } from '../../index.js'

export const command = 'start'
export const describe = 'Start the Slack daemon browser'

interface StartOptions extends GlobalOptions {
  headless: boolean
  chromePath?: string
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .option('headless', {
      type: 'boolean',
      default: true,
      describe: 'Run daemon browser in headless mode when starting',
    })
    .option('chrome-path', {
      type: 'string',
      describe: 'Path to Chrome executable for daemon start',
    })

export async function handler(argv: ArgumentsCamelCase<StartOptions>): Promise<void> {
  const { cdpUrl, json: asJson, headless, chromePath } = argv

  const status = await startSlackDaemon({
    cdpUrl,
    headless,
    chromePath,
  })

  if (asJson) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
    return
  }

  process.stdout.write(`Running: ${status.running ? 'yes' : 'no'}\n`)
  process.stdout.write(`CDP URL: ${status.cdpUrl}\n`)
  if (typeof status.pid === 'number') {
    process.stdout.write(`PID: ${status.pid}\n`)
  }
}
