import { fileURLToPath } from 'node:url'
import type { Argv } from 'yargs'
import type { GlobalOptions } from '../index.js'

export const command = 'daemon <command>'
export const describe = 'Manage a long-running Chrome daemon for CLI reuse'

export const builder = (yargs: Argv<GlobalOptions>) => {
  const commandsDir = fileURLToPath(new URL('./daemon', import.meta.url))
  return yargs.commandDir(commandsDir, {
    extensions: ['js', 'ts'],
    exclude: /\.test\.(ts|js)$/,
  })
}

export const handler = () => {}
