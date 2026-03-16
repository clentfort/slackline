export type SlackPermalink = {
  url: string;
  workspaceHost: string;
  channelId: string;
  messageTimestampRaw: string;
  messageTimestampUnix: number;
  threadTimestampRaw?: string;
  threadTimestampUnix?: number;
};

export function parseSlackPermalink(target: string): SlackPermalink | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (!parsedUrl.hostname.endsWith(".slack.com")) {
    return undefined;
  }

  const pathMatch = parsedUrl.pathname.match(
    /^\/(?:archives|messages)\/([A-Z0-9]+)\/p(\d{10,})(?:\/)?$/i,
  );
  if (!pathMatch) {
    return undefined;
  }

  const channelId = pathMatch[1].toUpperCase();
  const messageTimestampRaw = permalinkTsFromPacked(pathMatch[2]);
  if (!messageTimestampRaw) {
    return undefined;
  }

  const messageTimestampUnix = Number.parseFloat(messageTimestampRaw);
  if (!Number.isFinite(messageTimestampUnix)) {
    return undefined;
  }

  const threadParam = normalizeSlackTimestamp(parsedUrl.searchParams.get("thread_ts") ?? undefined);
  const threadTimestampUnix =
    typeof threadParam === "string" ? Number.parseFloat(threadParam) : undefined;

  return {
    url: parsedUrl.toString(),
    workspaceHost: parsedUrl.hostname,
    channelId,
    messageTimestampRaw,
    messageTimestampUnix,
    threadTimestampRaw: threadParam,
    threadTimestampUnix: Number.isFinite(threadTimestampUnix) ? threadTimestampUnix : undefined,
  };
}

export function buildSlackThreadUrl(options: {
  permalinkUrl: string;
  channelId: string;
  threadTimestampUnix: number;
}): string {
  const url = new URL(options.permalinkUrl);
  const normalizedThreadTs = toSlackTimestampString(options.threadTimestampUnix);

  url.searchParams.set("thread_ts", normalizedThreadTs);
  url.searchParams.set("cid", options.channelId);

  return url.toString();
}

function permalinkTsFromPacked(packed: string): string | undefined {
  const digits = packed.replace(/\D/g, "");
  if (digits.length < 10) {
    return undefined;
  }

  const seconds = digits.slice(0, 10);
  const micros = digits.slice(10).padEnd(6, "0").slice(0, 6);
  return `${seconds}.${micros}`;
}

function normalizeSlackTimestamp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return toSlackTimestampString(numeric);
}

function toSlackTimestampString(timestampUnix: number): string {
  return timestampUnix.toFixed(6);
}
