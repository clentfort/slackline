export type SlackConversationType = "channel" | "dm" | "unknown";

export function normalizeConversationId(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim().toUpperCase();
  return isConversationId(normalized) ? normalized : undefined;
}

export function isConversationId(value: string): boolean {
  if (!/^[CDG][A-Z0-9]{8,}$/.test(value)) {
    return false;
  }

  return /\d/.test(value.slice(1));
}

export function normalizeConversationAlias(value: string | undefined): string {
  return (value ?? "").replace(/^[@#]/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function conversationTypeFromId(id: string | undefined): SlackConversationType {
  if (!id) {
    return "unknown";
  }

  if (id.startsWith("D")) {
    return "dm";
  }

  if (id.startsWith("C") || id.startsWith("G")) {
    return "channel";
  }

  return "unknown";
}
