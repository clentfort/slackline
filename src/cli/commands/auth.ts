import { fileURLToPath } from 'node:url'
import type { Argv } from 'yargs'
import type { GlobalOptions } from '../index.js'

export const command = 'auth <command>'
export const describe = 'Authenticate and inspect Slack session state'

export const builder = (yargs: Argv<GlobalOptions>) => {
  const commandsDir = fileURLToPath(new URL('./auth', import.meta.url))
  return yargs.commandDir(commandsDir, {
    extensions: ['js', 'ts'],
    exclude: /\.test\.(ts|js)$/,
  })
}

export const handler = () => {}
