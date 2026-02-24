import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createParser } from './index.js'
import { postMessage } from '../service/slack/messages/post-message.js'
import { searchSlack } from '../service/slack/search/search-slack.js'
import * as postCommand from './commands/post.js'
import * as searchCommand from './commands/search.js'

vi.mock('../service/slack/messages/post-message.js', () => ({
  postMessage: vi.fn(),
}))

vi.mock('../service/slack/search/search-slack.js', () => ({
  searchSlack: vi.fn(),
}))

describe('CLI parser', () => {
  let stdoutWriteSpy: any
  let stderrWriteSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  const getParser = () => {
    const parser = createParser({ skipCommandDir: true })
    // Register only the commands we want to test to avoid yargs scanning directories in tests
    parser.command(postCommand.command, postCommand.describe, postCommand.builder, postCommand.handler as any)
    parser.command(searchCommand.command, searchCommand.describe, searchCommand.builder, searchCommand.handler as any)
    return parser
  }

  it('should call postMessage with correct arguments', async () => {
    const mockResult = {
      target: 'general',
      conversation: { name: 'general', type: 'public_channel' },
      posted: { timestampLabel: '12:34 PM' },
    }
    vi.mocked(postMessage).mockResolvedValue(mockResult as any)

    const parser = getParser()
    await parser.parseAsync(['post', 'general', 'hello world'])

    expect(postMessage).toHaveBeenCalledWith({
      target: 'general',
      message: 'hello world',
    })
    expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Posted to general'))
  })

  it('should call searchSlack with correct arguments', async () => {
    const mockResult = {
      query: 'test query',
      results: [
        { channel: 'general', user: 'alice', timestampLabel: '10:00 AM', message: 'matched message' }
      ],
    }
    vi.mocked(searchSlack).mockResolvedValue(mockResult as any)

    const parser = getParser()
    await parser.parseAsync(['search', 'test query', '--limit', '5'])

    expect(searchSlack).toHaveBeenCalledWith({
      query: 'test query',
      limit: 5,
    })
    expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Matches: 1'))
    expect(stdoutWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[general] alice'))
  })

  it('should output JSON when --json flag is provided', async () => {
    const mockResult = {
      target: 'general',
      conversation: { name: 'general', type: 'public_channel' },
      posted: { timestampLabel: '12:34 PM' },
    }
    vi.mocked(postMessage).mockResolvedValue(mockResult as any)

    const parser = getParser()
    await parser.parseAsync(['post', 'general', 'hello', '--json'])

    const output = stdoutWriteSpy.mock.calls.find((call: any[]) => call[0].includes('{'))[0]
    const jsonOutput = JSON.parse(output)
    expect(jsonOutput).toEqual(mockResult)
  })

  it('should show error for invalid command', async () => {
    let capturedError = ''
    const parser = getParser()
      .exitProcess(false)
      .fail((msg) => {
        capturedError = msg
      })

    await parser.parseAsync(['invalid-command'])

    expect(capturedError).toContain('Unknown argument: invalid-command')
  })
})
