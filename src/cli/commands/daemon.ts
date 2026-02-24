import type { Argv, ArgumentsCamelCase } from 'yargs'
import {
  getSlackDaemonStatus,
  startSlackDaemon,
  stopSlackDaemon,
  type SlackDaemonStatus,
} from '../../service/playwright/daemon-manager.js'
import type { GlobalOptions } from '../index.js'

export const command = 'daemon <action>'
export const describe = 'Manage a long-running Chrome daemon for CLI reuse'

interface DaemonOptions extends GlobalOptions {
  action: 'start' | 'stop' | 'status'
  headless: boolean
  chromePath?: string
  json: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .positional('action', {
      type: 'string',
      choices: ['start', 'stop', 'status'] as const,
      describe: 'Daemon lifecycle action',
      demandOption: true,
    })
    .option('headless', {
      type: 'boolean',
      default: true,
      describe: 'Run daemon browser in headless mode when starting',
    })
    .option('chrome-path', {
      type: 'string',
      describe: 'Path to Chrome executable for daemon start',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
    })

export async function handler(argv: ArgumentsCamelCase<DaemonOptions>): Promise<void> {
  const { action, cdpUrl, json: asJson, headless, chromePath } = argv

  if (action === 'start') {
    const status = await startSlackDaemon({
      cdpUrl,
      headless,
      chromePath,
    })
    printStatus(status, asJson)
    return
  }

  if (action === 'stop') {
    const status = await stopSlackDaemon()
    printStatus(status, asJson)
    return
  }

  const status = await getSlackDaemonStatus({ cdpUrl })
  printStatus(status, asJson)
}

function printStatus(status: SlackDaemonStatus, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
    return
  }

  process.stdout.write(`Running: ${status.running ? 'yes' : 'no'}\n`)
  process.stdout.write(`CDP URL: ${status.cdpUrl}\n`)

  if (typeof status.pid === 'number') {
    process.stdout.write(`PID: ${status.pid}\n`)
  }

  if (typeof status.pidAlive === 'boolean') {
    process.stdout.write(`PID alive: ${status.pidAlive ? 'yes' : 'no'}\n`)
  }

  if (status.profileDir) {
    process.stdout.write(`Profile dir: ${status.profileDir}\n`)
  }

  if (typeof status.headless === 'boolean') {
    process.stdout.write(`Headless: ${status.headless ? 'yes' : 'no'}\n`)
  }
}
