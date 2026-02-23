import {
  getSlackDaemonStatus,
  startSlackDaemon,
  stopSlackDaemon,
  type SlackDaemonStatus,
} from '../../service/playwright/daemon-manager.js'

export const command = 'daemon <action>'
export const describe = 'Manage a long-running Chrome daemon for CLI reuse'

export const builder = (yargs: any) =>
  yargs
    .positional('action', {
      type: 'string',
      choices: ['start', 'stop', 'status'] as const,
      describe: 'Daemon lifecycle action',
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

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const action = String(argv.action)
  const cdpUrl = String(argv.cdpUrl)
  const asJson = Boolean(argv.json)

  if (action === 'start') {
    const headless = Boolean(argv.headless)
    const chromePath = typeof argv.chromePath === 'string' ? argv.chromePath : undefined
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
