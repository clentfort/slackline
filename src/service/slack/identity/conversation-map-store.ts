import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  isConversationId,
  normalizeConversationAlias,
  normalizeConversationId,
} from "../conversation/conversation-identity.js";
import { getConversationMappingsPath, getSlacklineDir } from "../utils/paths.js";

export type KnownConversationType = "channel" | "dm" | "unknown";

type KnownConversationRecord = {
  id: string;
  name?: string;
  type?: KnownConversationType;
  aliases: string[];
  updatedAt: string;
};

type WorkspaceConversationMappings = {
  byId: Record<string, KnownConversationRecord>;
  byAlias: Record<string, string>;
};

type ConversationMappingsFile = {
  version: 1;
  workspaces: Record<string, WorkspaceConversationMappings>;
};

const EMPTY_MAPPINGS: ConversationMappingsFile = {
  version: 1,
  workspaces: {},
};

export function workspaceKeyFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const teamId = parsed.pathname.match(/\/client\/([^/]+)/)?.[1];
    if (teamId) {
      return `team:${teamId}`;
    }

    return `host:${parsed.host}`;
  } catch {
    return undefined;
  }
}

export function resolveKnownConversationId(options: {
  workspaceKey: string;
  target: string;
}): string | undefined {
  const normalizedTarget =
    normalizeConversationId(options.target) || normalizeConversationAlias(options.target);
  if (!normalizedTarget) {
    return undefined;
  }

  if (isConversationId(normalizedTarget)) {
    return normalizedTarget;
  }

  const mappings = loadMappings();
  const workspace = mappings.workspaces[options.workspaceKey];
  if (!workspace) {
    return undefined;
  }

  const resolvedId = workspace.byAlias[normalizedTarget];
  if (!resolvedId) {
    return undefined;
  }

  return isConversationId(resolvedId) ? resolvedId : undefined;
}

export function getKnownConversationName(options: {
  workspaceKey: string;
  conversationId: string;
}): string | undefined {
  const normalizedId = normalizeConversationId(options.conversationId);
  if (!normalizedId) {
    return undefined;
  }

  const mappings = loadMappings();
  const workspace = mappings.workspaces[options.workspaceKey];
  return workspace?.byId[normalizedId]?.name;
}

export function rememberKnownConversation(options: {
  workspaceKey: string;
  id: string;
  name?: string;
  type?: KnownConversationType;
  aliases?: string[];
}): void {
  const normalizedId = normalizeConversationId(options.id);
  if (!normalizedId) {
    return;
  }

  const mappings = loadMappings();
  const workspace = ensureWorkspace(mappings, options.workspaceKey);
  const existing = workspace.byId[normalizedId];

  const aliasSet = new Set<string>(existing?.aliases ?? []);
  const primaryAlias = normalizeConversationAlias(options.name);
  if (primaryAlias) {
    aliasSet.add(primaryAlias);
  }

  for (const alias of options.aliases ?? []) {
    const normalizedAlias = normalizeConversationAlias(alias);
    if (normalizedAlias) {
      aliasSet.add(normalizedAlias);
    }
  }

  const nextName = options.name?.trim() || existing?.name;
  const nextType = options.type ?? existing?.type;
  const nextAliases = [...aliasSet];

  const recordChanged =
    !existing ||
    existing.name !== nextName ||
    existing.type !== nextType ||
    !sameStringSet(existing.aliases, nextAliases);

  if (!recordChanged) {
    return;
  }

  const now = new Date().toISOString();
  const nextRecord: KnownConversationRecord = {
    id: normalizedId,
    name: nextName,
    type: nextType,
    aliases: nextAliases,
    updatedAt: now,
  };

  workspace.byId[normalizedId] = nextRecord;

  for (const alias of nextRecord.aliases) {
    workspace.byAlias[alias] = normalizedId;
  }

  saveMappings(mappings);
}

export function rememberKnownConversations(options: {
  workspaceKey: string;
  entries: Array<{ id: string; name?: string; type?: KnownConversationType }>;
}): void {
  if (options.entries.length === 0) {
    return;
  }

  const mappings = loadMappings();
  const workspace = ensureWorkspace(mappings, options.workspaceKey);
  let changed = false;

  for (const entry of options.entries) {
    const normalizedId = normalizeConversationId(entry.id);
    if (!normalizedId) {
      continue;
    }

    const existing = workspace.byId[normalizedId];
    const aliasSet = new Set<string>(existing?.aliases ?? []);
    const normalizedNameAlias = normalizeConversationAlias(entry.name);
    if (normalizedNameAlias) {
      aliasSet.add(normalizedNameAlias);
    }

    const nextName = entry.name?.trim() || existing?.name;
    const nextType = entry.type ?? existing?.type;
    const nextAliases = [...aliasSet];

    const recordChanged =
      !existing ||
      existing.name !== nextName ||
      existing.type !== nextType ||
      !sameStringSet(existing.aliases, nextAliases);

    if (!recordChanged) {
      continue;
    }

    changed = true;
    const nextRecord: KnownConversationRecord = {
      id: normalizedId,
      name: nextName,
      type: nextType,
      aliases: nextAliases,
      updatedAt: new Date().toISOString(),
    };

    workspace.byId[normalizedId] = nextRecord;

    for (const alias of nextRecord.aliases) {
      workspace.byAlias[alias] = normalizedId;
    }
  }

  if (changed) {
    saveMappings(mappings);
  }
}

function ensureWorkspace(
  mappings: ConversationMappingsFile,
  workspaceKey: string,
): WorkspaceConversationMappings {
  const existing = mappings.workspaces[workspaceKey];
  if (existing) {
    return existing;
  }

  const created: WorkspaceConversationMappings = {
    byId: {},
    byAlias: {},
  };
  mappings.workspaces[workspaceKey] = created;
  return created;
}

function loadMappings(): ConversationMappingsFile {
  const path = getConversationMappingsPath();
  if (!existsSync(path)) {
    return {
      version: 1,
      workspaces: {},
    };
  }

  try {
    const content = readFileSync(path, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationMappingsFile>;
    if (parsed.version !== 1 || typeof parsed.workspaces !== "object" || !parsed.workspaces) {
      return {
        version: 1,
        workspaces: {},
      };
    }

    return {
      version: 1,
      workspaces: parsed.workspaces,
    };
  } catch {
    return {
      version: 1,
      workspaces: {},
    };
  }
}

function saveMappings(mappings: ConversationMappingsFile): void {
  const path = getConversationMappingsPath();
  const dir = getSlacklineDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(mappings, null, 2), "utf8");
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  for (const value of right) {
    if (!leftSet.has(value)) {
      return false;
    }
  }

  return true;
}

export function resetConversationMappingsForTests(): void {
  saveMappings(EMPTY_MAPPINGS);
}
