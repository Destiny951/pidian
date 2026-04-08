import * as fs from 'fs';
import * as path from 'path';

import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { ChatMessage, Conversation } from '../../../core/types';
import { extractContentBeforeXmlContext } from '../../../utils/context';

interface PiSessionHeader {
  type: 'session';
  id: string;
}

interface PiSessionMessageEntry {
  type: 'message';
  id: string;
  timestamp?: string;
  message?: {
    role?: 'user' | 'assistant' | string;
    timestamp?: number;
    content?: unknown;
  };
}

type PiSessionEntry = PiSessionHeader | PiSessionMessageEntry | Record<string, unknown>;

function toSafeSessionDirName(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}

function readJsonlEntries(filePath: string): PiSessionEntry[] {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: PiSessionEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as PiSessionEntry);
    } catch {
      // skip malformed entries
    }
  }
  return entries;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const rec = block as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      parts.push(rec.text);
    }
  }

  return parts.join('');
}

function parseMessageTimestamp(entry: PiSessionMessageEntry): number {
  const fromMessage = entry.message?.timestamp;
  if (typeof fromMessage === 'number' && Number.isFinite(fromMessage)) {
    return fromMessage;
  }

  if (typeof entry.timestamp === 'string') {
    const parsed = Date.parse(entry.timestamp);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function toChatMessages(entries: PiSessionEntry[], sessionId: string): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || entry.type !== 'message') {
      continue;
    }

    const msgEntry = entry as PiSessionMessageEntry;
    const role = msgEntry.message?.role;
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }

    const content = extractTextContent(msgEntry.message?.content);
    if (!content.trim()) {
      continue;
    }

    const displayContent = role === 'user' ? extractDisplayContent(content) : undefined;

    messages.push({
      id: `pi-${sessionId}-${msgEntry.id}`,
      role,
      content,
      ...(displayContent ? { displayContent } : {}),
      timestamp: parseMessageTimestamp(msgEntry),
      ...(role === 'user' ? { userMessageId: msgEntry.id } : {}),
      ...(role === 'assistant' ? { assistantMessageId: msgEntry.id } : {}),
    });
  }

  return messages;
}

function extractDisplayContent(content: string): string | undefined {
  const extracted = extractContentBeforeXmlContext(content);
  if (extracted) {
    return extracted;
  }

  const markers = [
    '\n[Current note:',
    '\n[Editor selection from ',
    '\n[Browser selection from ',
    '\n[Canvas selection from ',
  ];

  const indexes = markers
    .map((marker) => content.indexOf(marker))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);

  if (indexes.length === 0) {
    return undefined;
  }

  const head = content.slice(0, indexes[0]).trim();
  return head || undefined;
}

export class PiConversationHistoryService implements ProviderConversationHistoryService {
  private hydratedConversationKeys = new Map<string, string>();

  async hydrateConversationHistory(conversation: Conversation, vaultPath: string | null): Promise<void> {
    const sessionId = conversation.sessionId;
    if (!sessionId || !vaultPath) {
      this.hydratedConversationKeys.delete(conversation.id);
      return;
    }

    const sessionFilePath = this.findSessionFilePath(vaultPath, sessionId);
    if (!sessionFilePath) {
      this.hydratedConversationKeys.delete(conversation.id);
      return;
    }

    const hydrationKey = `${sessionId}::${sessionFilePath}`;
    if (
      conversation.messages.length > 0
      && this.hydratedConversationKeys.get(conversation.id) === hydrationKey
    ) {
      return;
    }

    const entries = readJsonlEntries(sessionFilePath);
    const messages = toChatMessages(entries, sessionId);
    if (messages.length === 0) {
      this.hydratedConversationKeys.delete(conversation.id);
      return;
    }

    conversation.messages = messages;
    conversation.providerState = {
      ...(conversation.providerState ?? {}),
      sessionFilePath,
    };
    this.hydratedConversationKeys.set(conversation.id, hydrationKey);
  }

  async deleteConversationSession(_conversation: Conversation, _vaultPath: string | null): Promise<void> {
    // Never delete ~/.pi session transcripts
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return conversation?.sessionId ?? null;
  }

  isPendingForkConversation(_conversation: Conversation): boolean {
    return false;
  }

  buildForkProviderState(
    _sourceSessionId: string,
    _resumeAt: string,
    _sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {};
  }

  buildPersistedProviderState(conversation: Conversation): Record<string, unknown> | undefined {
    const state = conversation.providerState ?? {};
    const sessionFilePath = state.sessionFilePath;
    if (typeof sessionFilePath !== 'string' || !sessionFilePath) {
      return undefined;
    }
    return { sessionFilePath };
  }

  private findSessionFilePath(vaultPath: string, sessionId: string): string | null {
    const rootDir = path.join(
      process.env.HOME ?? '',
      '.pi',
      'agent',
      'sessions',
      toSafeSessionDirName(vaultPath),
    );

    let fileNames: string[] = [];
    try {
      fileNames = fs.readdirSync(rootDir);
    } catch {
      return null;
    }

    const fastMatch = fileNames.find((name) => name.endsWith(`_${sessionId}.jsonl`));
    if (fastMatch) {
      return path.join(rootDir, fastMatch);
    }

    for (const fileName of fileNames) {
      if (!fileName.endsWith('.jsonl')) {
        continue;
      }
      const filePath = path.join(rootDir, fileName);
      const entries = readJsonlEntries(filePath);
      const header = entries.find((entry) => entry && typeof entry === 'object' && entry.type === 'session') as PiSessionHeader | undefined;
      if (header?.id === sessionId) {
        return filePath;
      }
    }

    return null;
  }
}
