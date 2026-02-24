import type { Argv, ArgumentsCamelCase } from 'yargs'
import {
  getSlackDaemonStatus,
  startSlackDaemon,
  stopSlackDaemon,
  type SlackDaemonStatus,
} from '../../service/playwright/daemon-manager.js'
import type { GlobalOptions } from '../index.js'
import { withSlackClient } from '../../service/slack/with-slack-client.js'

export const command = 'daemon <action>'
export const describe = 'Manage a long-running Chrome daemon for CLI reuse'

interface DaemonOptions extends GlobalOptions {
  action: 'start' | 'stop' | 'status' | 'listen'
  headless: boolean
  chromePath?: string
  json: boolean
  webhook?: string
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .positional('action', {
      type: 'string',
      choices: ['start', 'stop', 'status', 'listen'] as const,
      describe: 'Daemon lifecycle action',
      demandOption: true,
    })
    .option('webhook', {
      type: 'string',
      describe: 'Webhook URL to forward notifications to (required for "listen")',
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
  const { action, cdpUrl, json: asJson, headless, chromePath, webhook } = argv

  if (action === 'listen') {
    if (!webhook) {
      throw new Error('Webhook URL is required for "listen" action. Use --webhook <url>')
    }

    await withSlackClient({ skipLoginCheck: false }, async (client) => {
      process.stdout.write(`Listening for Slack events and forwarding to ${webhook}...\n`)
      process.stdout.write('Press Ctrl+C to stop.\n')

      await client.notifications.listen(async (event) => {
        const timestamp = new Date().toISOString()
        if (asJson) {
          process.stdout.write(`${JSON.stringify({ timestamp, ...event })}\n`)
        } else {
          if (event.type === 'notification') {
            process.stdout.write(`[${timestamp}] Notification: ${event.data.title}\n`)
          } else {
            process.stdout.write(`[${timestamp}] Title changed: ${event.data.title}\n`)
          }
        }

        try {
          const response = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          })
          if (!response.ok) {
            process.stderr.write(`Webhook returned error: ${response.status} ${response.statusText}\n`)
          }
        } catch (err) {
          process.stderr.write(`Failed to send webhook: ${err instanceof Error ? err.message : String(err)}\n`)
        }
      })

      // Keep the process running until interrupted
      return new Promise<void>((resolve) => {
        const onSigInt = () => {
          process.stdout.write('\nStopping listener...\n')
          process.off('SIGINT', onSigInt)
          resolve()
        }
        process.on('SIGINT', onSigInt)
      })
    })
    return
  }

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
