import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type SlackDaemonState = {
  pid?: number;
  cdpUrl: string;
  profileDir: string;
  chromePath: string;
  headless: boolean;
  startedAt: string;
};

export type SlackDaemonStatus = {
  running: boolean;
  cdpUrl: string;
  pid?: number;
  pidAlive?: boolean;
  profileDir?: string;
  headless?: boolean;
  startedAt?: string;
};

type StartDaemonOptions = {
  cdpUrl: string;
  chromePath?: string;
  headless: boolean;
};

export const projectRoot = process.cwd();
export const stateDir = path.resolve(projectRoot, ".slackline");
const daemonStatePath = path.resolve(stateDir, "daemon-state.json");
const chromeProfileDir = path.resolve(stateDir, "chrome-profile");
const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function startSlackDaemon(options: StartDaemonOptions): Promise<SlackDaemonStatus> {
  const cdpUrl = normalizeCdpUrl(options.cdpUrl);
  const existing = await getSlackDaemonStatus({ cdpUrl });
  if (existing.running) {
    if (options.headless === existing.headless) {
      return existing;
    }
    await stopSlackDaemon();
  }

  const chromePath =
    options.chromePath?.trim() || process.env.SLACKLINE_CHROME_PATH || defaultChromePath;
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome executable not found at: ${chromePath}`);
  }

  const { host, port } = parseCdpEndpoint(cdpUrl);

  await mkdir(stateDir, { recursive: true });
  await mkdir(chromeProfileDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--remote-debugging-address=${host}`,
    `--user-data-dir=${chromeProfileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=DialMediaRouteProvider",
    ...(options.headless ? ["--headless=new"] : []),
    "about:blank",
  ];

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  await waitForCdp(cdpUrl, 25000);

  const state: SlackDaemonState = {
    pid: child.pid,
    cdpUrl,
    profileDir: chromeProfileDir,
    chromePath,
    headless: options.headless,
    startedAt: new Date().toISOString(),
  };

  await writeDaemonState(state);

  return {
    running: true,
    cdpUrl,
    pid: child.pid,
    pidAlive: isPidAlive(child.pid),
    profileDir: chromeProfileDir,
    headless: options.headless,
    startedAt: state.startedAt,
  };
}

export async function stopListener(): Promise<void> {
  const pidPath = path.resolve(stateDir, "listener.pid");
  try {
    if (existsSync(pidPath)) {
      const content = await readFile(pidPath, "utf8");
      const pid = Number.parseInt(content.trim(), 10);
      if (isPidAlive(pid)) {
        process.kill(pid, "SIGTERM");
      }
      await rm(pidPath, { force: true });
    }
  } catch {
    // Ignore errors during cleanup
  }
}

export async function stopSlackDaemon(): Promise<SlackDaemonStatus> {
  await stopListener();

  const state = await readDaemonState();
  if (!state) {
    return {
      running: false,
      cdpUrl: defaultCdpUrl(),
    };
  }

  if (typeof state.pid === "number" && isPidAlive(state.pid)) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // Continue to status check.
    }
  }

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const up = await isCdpReachable(state.cdpUrl);
    if (!up) {
      break;
    }
    await delay(250);
  }

  const stillRunning = await isCdpReachable(state.cdpUrl);
  if (stillRunning && typeof state.pid === "number" && isPidAlive(state.pid)) {
    try {
      process.kill(state.pid, "SIGKILL");
    } catch {
      // Ignore and continue.
    }
  }

  await rm(daemonStatePath, { force: true }).catch(() => {});

  return {
    running: false,
    cdpUrl: state.cdpUrl,
    pid: state.pid,
    pidAlive: false,
    profileDir: state.profileDir,
    headless: state.headless,
    startedAt: state.startedAt,
  };
}

export async function getSlackDaemonStatus(
  options: { cdpUrl?: string } = {},
): Promise<SlackDaemonStatus> {
  const state = await readDaemonState();
  const cdpUrl = normalizeCdpUrl(options.cdpUrl || state?.cdpUrl || defaultCdpUrl());
  const running = await isCdpReachable(cdpUrl);

  return {
    running,
    cdpUrl,
    pid: state?.pid,
    pidAlive: typeof state?.pid === "number" ? isPidAlive(state.pid) : undefined,
    profileDir: state?.profileDir,
    headless: state?.headless,
    startedAt: state?.startedAt,
  };
}

async function waitForCdp(cdpUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpReachable(cdpUrl)) {
      return;
    }
    await delay(300);
  }

  throw new Error(`Timed out waiting for daemon CDP endpoint: ${cdpUrl}`);
}

async function isCdpReachable(cdpUrl: string): Promise<boolean> {
  const endpoint = new URL("/json/version", cdpUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function readDaemonState(): Promise<SlackDaemonState | null> {
  try {
    const content = await readFile(daemonStatePath, "utf8");
    return JSON.parse(content) as SlackDaemonState;
  } catch {
    return null;
  }
}

async function writeDaemonState(state: SlackDaemonState): Promise<void> {
  await writeFile(daemonStatePath, JSON.stringify(state, null, 2), "utf8");
}

function isPidAlive(pid: number | undefined): boolean {
  if (typeof pid !== "number") {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeCdpUrl(rawUrl: string): string {
  const normalized = rawUrl.trim() || defaultCdpUrl();
  return normalized.replace(/\/$/, "");
}

function defaultCdpUrl(): string {
  return "http://127.0.0.1:9222";
}

function parseCdpEndpoint(cdpUrl: string): { host: string; port: number } {
  const parsed = new URL(cdpUrl);
  const host = parsed.hostname || "127.0.0.1";
  const port = Number.parseInt(parsed.port || "9222", 10);

  if (!Number.isFinite(port)) {
    throw new Error(`Invalid CDP URL port: ${cdpUrl}`);
  }

  return { host, port };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
