import type { Argv, ArgumentsCamelCase } from 'yargs'
import {
  stopSlackDaemon,
} from '../../../service/playwright/daemon-manager.js'
import type { GlobalOptions } from '../../index.js'

export const command = 'stop'
export const describe = 'Stop the Slack daemon browser'

interface StopOptions extends GlobalOptions {
  json: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs.option('json', {
    type: 'boolean',
    default: false,
    describe: 'Emit machine-readable JSON output',
  })

export async function handler(argv: ArgumentsCamelCase<StopOptions>): Promise<void> {
  const { json: asJson } = argv

  const status = await stopSlackDaemon()

  if (asJson) {
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
    return
  }

  process.stdout.write(`Running: ${status.running ? 'yes' : 'no'}\n`)
}
