import type { Argv, ArgumentsCamelCase } from 'yargs'
import { loginToSlack } from '../../../service/slack/auth/login.js'
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

  process.stdout.write('Opening Slack login window. Complete login in browser and keep it open until CLI confirms.\n')
  await loginToSlack({ timeoutSeconds, manualConfirm })
  process.stdout.write('Login flow completed. Persistent browser profile is ready.\n')
}
