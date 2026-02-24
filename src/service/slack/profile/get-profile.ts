import { type SlackProfile } from './profile-manager.js'
import { withSlackClient } from '../with-slack-client.js'

export { type SlackProfile }

type GetProfileOptions = Record<string, never>

export async function getSlackProfile(options: GetProfileOptions = {}): Promise<SlackProfile> {
  return withSlackClient({}, async (client) => {
    return client.profile.get()
  })
}
