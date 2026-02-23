# slackline

Slack CLI automation using Playwright (no official Slack API).

## What is implemented

- TypeScript project with `yargs`
- command-dir based command loading (`src/cli/commands`)
- clear command/service separation
- persistent Chrome profile for Slack session reuse
- initial commands:
  - `auth login`: open Slack and persist login
  - `auth whoami`: show login status and profile info
  - `search`: search Slack messages (structured user/channel/time/message output)
  - `messages`: read latest messages from a channel or DM
  - `post`: send a message to a channel or DM
  - `daemon start|stop|status`: manage a background Chrome CDP daemon
  - `profile` / `whoami`: show login status and profile info

## Install

```bash
npm install
npm run build
```

## First-time login bootstrap

Run this once, sign in manually in the opened browser, then future runs should keep your session.

```bash
npm run auth:login -- --workspace-url "https://app.slack.com/client/T0AGXBKFV4H/C0AG30W2SG7?entry_point=nav_menu"
```

This command launches a real Chrome window via Playwright so you can type credentials and complete login/MFA interactively. By default, the CLI keeps waiting and asks you to press Enter in the terminal when you are done, then verifies the session.

Useful login flags:

- `--timeout-seconds 600` for a longer login window
- `--manual-confirm false` to auto-detect login without pressing Enter

## Browser modes

All commands support these global flags:

- `--browser-mode persistent` (default): launch/close per command with profile in `.slackline/chrome-profile`
- `--browser-mode attach`: attach to an already running Chrome with remote debugging (default `--cdp-url http://127.0.0.1:9222`)
- `--browser-mode daemon`: attach to Slackline-managed background Chrome daemon

Browser selection:

- `--browser chrome` (default)
- `--browser firefox` (persistent mode only)

### Attach to your own running Chrome

Start Chrome with remote debugging (example):

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Then run Slackline in attach mode:

```bash
node dist/cli/index.js --browser-mode attach auth whoami
```

### Daemon mode

Start daemon (reuses the same profile as persistent mode: `.slackline/chrome-profile`):

```bash
node dist/cli/index.js daemon start
```

Check status:

```bash
node dist/cli/index.js daemon status
```

Run commands against daemon:

```bash
node dist/cli/index.js --browser-mode daemon search --query test1
```

Interactive login with daemon mode:

```bash
node dist/cli/index.js --browser-mode daemon auth login
```

If daemon is headless, Slackline automatically restarts it in headed mode so a browser window opens for login.

Stop daemon:

```bash
node dist/cli/index.js daemon stop
```

Note: daemon and persistent mode share the same profile. Use one mode at a time to avoid profile-lock errors.

Equivalent command:

```bash
npx tsx src/cli.ts auth login --workspace-url "https://app.slack.com/client/T0AGXBKFV4H/C0AG30W2SG7?entry_point=nav_menu"
```

## Search

```bash
npm run search -- --query test1
```

Text output now includes split fields:

```text
- [sozial] christian_slack.com | Heute um 15:54 Uhr | test
```

JSON output:

```bash
npm run search -- --query test2 --json
```

JSON fields per hit:

- `user`
- `channel`
- `message`
- `timestampLabel`
- `timestampUnix`
- `timestampIso`

## Read latest messages

Get the latest 20 visible messages (default):

```bash
node dist/cli/index.js messages --target sozial
```

Custom count:

```bash
node dist/cli/index.js messages --target sozial --limit 50
```

DM target:

```bash
node dist/cli/index.js messages --target christian_slack.com --limit 20
```

JSON output:

```bash
node dist/cli/index.js messages --target sozial --json
```

## Post a message

Post to channel:

```bash
node dist/cli/index.js post --target sozial --message "hello from slackline"
```

Post to DM:

```bash
node dist/cli/index.js post --target christian_slack.com --message "ping"
```

## Verify login status

```bash
node dist/cli/index.js profile
```

Alias:

```bash
node dist/cli/index.js whoami
```

Namespaced alias:

```bash
node dist/cli/index.js auth whoami
```

## Environment variables

You can set global options through env vars (prefix `SLACKLINE_`):

- `SLACKLINE_WORKSPACE_URL`

## Persistent state location

Browser profile and temp files are stored under:

```text
.slackline/
```

This directory is ignored by git.

## Notes

- Install browser support once with `npm run playwright:install`.
- Slack UI selectors can change; search selectors may need adjustments.
- If session expires, run `auth login` again.
