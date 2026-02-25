# AGENTS.md - Slackline Codebase Guide

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

- **Language:** TypeScript (strict mode, ES2022 target)
- **Runtime:** Node.js >= 20
- **Module System:** ESM (`"type": "module"`)
- **Framework:** CLI tool using `yargs` with Playwright for browser automation
- **Purpose:** Slack CLI automation using Playwright to control Chrome/Firefox (no official Slack API)

## Build/Lint/Test Commands

| Command                     | Description                                  |
|-----------------------------|----------------------------------------------|
| `npm run build`             | Build with `tsgo` (TypeScript native compiler) |
| `npm run dev`               | Run in dev mode with `tsx src/cli.ts`        |
| `npm run lint`              | Lint with `oxlint .`                         |
| `npm run format`            | Format with `oxfmt .`                        |
| `npm run typecheck`         | Type check with `tsgo --noEmit`              |
| `npm test`                  | Run all tests with `vitest run`              |
| `npm run playwright:install`| Install Chrome for Playwright                |

### Running a Single Test

```bash
# Run a specific test file
npx vitest run src/cli/browser-options.test.ts

# Run tests matching a pattern
npx vitest run --testNamePattern "should correctly transform"

# Run tests in watch mode
npx vitest src/cli/browser-options.test.ts
```

### Pre-commit Hooks

Pre-commit runs: `npm run typecheck && npx lint-staged`
lint-staged runs: `oxfmt` on all files, `oxlint --fix` on `.js`/`.ts` files

## Directory Structure

```
src/
├── cli.ts                    # Entry point
├── cli/
│   ├── index.ts              # CLI parser with yargs
│   ├── browser-options.ts    # Browser option parsing
│   └── commands/             # CLI commands (auth, daemon, messages, post, search)
└── service/
    ├── playwright/           # Browser context management, daemon lifecycle
    └── slack/                # Slack client, managers (conversation, messages, notifications, profile, search)
```

## Import Patterns

**Always use `.js` extension for local imports (ESM requirement):**

```typescript
// Correct - always include .js extension
import { SlackClient } from "./slack-client.js";
import { withSlackClient } from "../with-slack-client.js";
import type { GlobalOptions } from "../../index.js";
```

**Node.js built-in modules with `node:` prefix:**

```typescript
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
```

**Type-only imports:**

```typescript
import type { Page, Locator } from "playwright";
import type { Argv, ArgumentsCamelCase } from "yargs";
```

## Naming Conventions

### Files

- kebab-case for all files: `message-manager.ts`, `browser-options.ts`
- Test files colocated: `*.test.ts` (not `.spec.ts`)

### Classes and Types

- PascalCase for classes: `SlackClient`, `MessageManager`
- Manager suffix for service classes: `ConversationManager`, `ProfileManager`
- Interface names: PascalCase with domain prefix: `SlackMessage`, `SlackSearchResult`
- Options types: `GlobalOptions`, `LoginOptions`, `SearchSlackOptions`
- Result types: `SlackPostMessageResult`, `SlackRecentMessagesResult`

### Functions and Variables

- camelCase for functions: `withSlackClient`, `searchSlack`, `getRecentMessages`
- camelCase for module constants: `defaultSlackWorkspaceUrl`
- SCREAMING_SNAKE_CASE for browser-injected helpers: `BROWSER_HELPERS`

### CLI Commands

Commands export: `command`, `describe`, `builder`, `handler`

```typescript
export const command = "search <query>";
export const describe = "Search Slack messages";
export const builder = (yargs: Argv) => { ... };
export const handler = async (argv: ArgumentsCamelCase<SearchOptions>) => { ... };
```

## Type Patterns

**Explicit type annotations for function parameters and return types:**

```typescript
export async function searchSlack(options: SearchSlackOptions): Promise<SlackSearchResult> {
  // ...
}
```

**Interface for object shapes:**

```typescript
export interface GlobalOptions {
  verbose: boolean;
  workspaceUrl: string;
  cdpUrl: string;
  json: boolean;
  chromePath?: string;
}
```

**Type alias for union types:**

```typescript
export type SlackEvent =
  | { type: "notification"; data: SlackNotification }
  | { type: "title"; data: SlackTitleChange };
```

**Generic type parameters for wrappers:**

```typescript
export async function withSlackClient<T>(
  options: WithSlackClientOptions = {},
  callback: (client: SlackClient) => Promise<T>,
): Promise<T> { ... }
```

## Error Handling

**Throw descriptive Error with actionable message:**

```typescript
throw new Error("Not logged in to Slack. Run `slackline auth login` first.");
throw new Error(`Could not find Slack channel or DM in sidebar: ${target}`);
```

**Silent catch for optional operations:**

```typescript
await clearButton.click({ force: true }).catch(() => {});
await this.page.keyboard.press("End").catch(() => undefined);
```

**Empty catch for non-critical failures in loops:**

```typescript
try {
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  return locator;
} catch {
  // Try next selector.
}
```

**CLI error handling with stderr:**

```typescript
run(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
```

## Output Patterns

**Use `process.stdout.write` instead of `console.log`:**

```typescript
process.stdout.write(`Query: ${result.query}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

**JSON output flag pattern:**

```typescript
if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return;
}
// Human-readable output follows
```

## Testing Guidelines

- Tests are colocated with source files (`*.test.ts`)
- Use Vitest for testing
- Static methods preferred for pure logic (testable without browser)
- Mock Playwright page/context when testing browser-dependent code

## Code Style Summary

1. Always use `.js` extension in imports
2. Use `node:` prefix for Node.js built-ins
3. Use `import type` for type-only imports
4. Explicit return types on exported functions
5. kebab-case files, PascalCase classes, camelCase functions
6. Descriptive error messages with actionable instructions
7. Use `process.stdout.write` / `process.stderr.write` for output
8. Support `--json` flag for machine-readable output
