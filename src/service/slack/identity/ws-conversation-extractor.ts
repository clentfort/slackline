import {
  conversationTypeFromId,
  normalizeConversationId,
  type SlackConversationType,
} from "../conversation/conversation-identity.js";
import type { SlackWebSocketMessage } from "../types.js";

export type WebSocketConversationEntry = {
  id: string;
  name: string;
  type: SlackConversationType;
};

export function extractConversationEntriesFromSlackMessage(
  payload: SlackWebSocketMessage,
): WebSocketConversationEntry[] {
  const entries: WebSocketConversationEntry[] = [];
  const seen = new Set<string>();

  const add = (idValue: string | undefined, nameValue: string | undefined): void => {
    const id = normalizeConversationId(idValue);
    const name = normalizeName(nameValue);
    if (!id || !name) {
      return;
    }

    const key = `${id}|${name}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    entries.push({
      id,
      name,
      type: conversationTypeFromId(id),
    });
  };

  add(readStringField(payload, "channel"), readStringField(payload, "channel_name"));
  add(readStringField(payload, "channel_id"), readStringField(payload, "channel_name"));

  const directName = readStringField(payload, "name");
  if (directName) {
    add(readStringField(payload, "channel"), directName);
    add(readStringField(payload, "channel_id"), directName);
  }

  const queue: unknown[] = [payload.channel, payload.conversation, payload.event];
  const collectionKeys = ["channels", "conversations", "groups", "ims", "dms", "items", "results"];

  for (const key of collectionKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      queue.push(...value);
    }
  }

  const maxNodes = 120;
  let inspected = 0;

  while (queue.length > 0 && inspected < maxNodes) {
    inspected += 1;
    const node = queue.shift();
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as Record<string, unknown>;
    const id = pickId(record);
    const name = pickName(record);
    add(id, name);

    const nestedKeys = ["channel", "conversation", "item", "event"];
    for (const nestedKey of nestedKeys) {
      const nested = record[nestedKey];
      if (nested && typeof nested === "object") {
        queue.push(nested);
      }
    }
  }

  return entries;
}

function pickId(node: Record<string, unknown>): string | undefined {
  const idCandidates = ["id", "channel", "channel_id", "conversation_id"];
  for (const field of idCandidates) {
    const value = node[field];
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeConversationId(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function pickName(node: Record<string, unknown>): string | undefined {
  const nameCandidates = ["name", "channel_name", "display_name", "displayName"];
  for (const field of nameCandidates) {
    const value = node[field];
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeName(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function readStringField(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeName(value: string | undefined): string | undefined {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}
