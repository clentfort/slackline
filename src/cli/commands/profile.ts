import { getSlackProfile } from '../../service/slack/profile/get-profile.js'

export const command = 'profile'
export const aliases = ['whoami']
export const describe = 'Show current Slack login status and profile details'
export const builder = (yargs: any) =>
  yargs.option('json', {
    type: 'boolean',
    default: false,
    describe: 'Emit machine-readable JSON output',
  })

export async function handler(argv: Record<string, unknown>): Promise<void> {
  const asJson = Boolean(argv.json)

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
