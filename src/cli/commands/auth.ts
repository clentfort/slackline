import type { Argv, ArgumentsCamelCase } from 'yargs'
import { loginToSlack } from '../../service/slack/auth/login.js'
import { getConfig } from '../../service/slack/config.js'
import {
  getSlackDaemonStatus,
  startSlackDaemon,
  stopSlackDaemon,
} from '../../service/playwright/daemon-manager.js'
import { getSlackProfile } from '../../service/slack/profile/get-profile.js'
import type { GlobalOptions } from '../index.js'

export const command = 'auth <action>'
export const describe = 'Authenticate and inspect Slack session state'

interface AuthOptions extends GlobalOptions {
  action: 'login' | 'whoami' | 'profile'
  timeoutSeconds: number
  manualConfirm: boolean
  json: boolean
}

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs
    .positional('action', {
      type: 'string',
      choices: ['login', 'whoami', 'profile'] as const,
      describe: 'Auth action to execute',
      demandOption: true,
    })
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
    .option('json', {
      type: 'boolean',
      default: false,
      describe: 'Emit machine-readable JSON output',
    })

export async function handler(argv: ArgumentsCamelCase<AuthOptions>): Promise<void> {
  const { action, json: asJson, timeoutSeconds, manualConfirm } = argv
  const config = getConfig()

  if (action === 'login') {
    if (config.browser.mode === 'daemon') {
      await ensureInteractiveDaemon(config.browser.cdpUrl)
    }

    process.stdout.write('Opening Slack login window. Complete login in browser and keep it open until CLI confirms.\n')
    await loginToSlack({ timeoutSeconds, manualConfirm })
    process.stdout.write('Login flow completed. Persistent browser profile is ready.\n')
    return
  }

  const profile = await getSlackProfile({})

  if (asJson) {
    process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`)
    return
  }

  process.stdout.write(`Logged in: ${profile.loggedIn ? 'yes' : 'no'}\n`)
  if (profile.name) {
    process.stdout.write(`Name: ${profile.name}\n`)
  }
  if (profile.workspace) {
    process.stdout.write(`Workspace: ${profile.workspace}\n`)
  }
  process.stdout.write(`URL: ${profile.url}\n`)
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
