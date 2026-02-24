import type { Argv } from 'yargs'
import type { GlobalOptions } from '../index.js'

export const command = 'daemon <command>'
export const describe = 'Manage a long-running Chrome daemon for CLI reuse'

export const builder = (yargs: Argv<GlobalOptions>) =>
  yargs.commandDir('daemon', {
    extensions: ['js', 'ts'],
    exclude: /\.test\.(ts|js)$/,
  })

export const handler = () => {}
