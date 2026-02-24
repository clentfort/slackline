import type { Argv, ArgumentsCamelCase } from 'yargs'
import { loginToSlack } from '../../../service/slack/auth/login.js'
import { getConfig } from '../../../service/slack/config.js'
import {
  getSlackDaemonStatus,
  startSlackDaemon,
  stopSlackDaemon,
} from '../../../service/playwright/daemon-manager.js'
import type { GlobalOptions } from '../../index.js'

export const command = 'login'
export const describe = 'Interactive login to Slack to establish a session'

interface LoginOptions extends GlobalOptions {
  timeoutSeconds: number
  manualConfirm: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .option('timeout-seconds', {
      type: 'number',
      default: 300,
      describe: 'How long to wait for manual login completion',
    })
    .option('manual-confirm', {
      type: 'boolean',
      default: true,
      describe: 'Wait for Enter confirmation in terminal before verifying login',
    })

export async function handler(argv: ArgumentsCamelCase<LoginOptions>): Promise<void> {
  const { timeoutSeconds, manualConfirm } = argv
  const config = getConfig()

  if (config.browser.mode === 'daemon') {
    await ensureInteractiveDaemon(config.browser.cdpUrl)
  }

  process.stdout.write('Opening Slack login window. Complete login in browser and keep it open until CLI confirms.\n')
  await loginToSlack({ timeoutSeconds, manualConfirm })
  process.stdout.write('Login flow completed. Persistent browser profile is ready.\n')
}

async function ensureInteractiveDaemon(cdpUrl: string | undefined): Promise<void> {
  const status = await getSlackDaemonStatus({ cdpUrl })

  if (!status.running) {
    process.stdout.write('Starting daemon in headed mode for interactive login.\n')
    await startSlackDaemon({
      cdpUrl: status.cdpUrl,
      headless: false,
    })
    return
  }

  if (status.headless === false) {
    return
  }

  if (status.headless === true) {
    process.stdout.write('Daemon is running headless; restarting in headed mode for login.\n')
    await stopSlackDaemon()
    await startSlackDaemon({
      cdpUrl: status.cdpUrl,
      headless: false,
    })
    return
  }

  process.stdout.write('Daemon mode detected an unmanaged CDP browser; reusing it as-is.\n')
}
