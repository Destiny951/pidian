import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { Conversation } from '@/core/types';
import { PiConversationHistoryService } from '@/providers/pi/history/PiConversationHistoryService';

function makeConversation(sessionId: string | null): Conversation {
  return {
    id: 'conv-1',
    providerId: 'pi',
    title: 'test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionId,
    messages: [],
  };
}

describe('PiConversationHistoryService', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it('hydrates messages from PI session jsonl after restart', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-home-'));
    process.env.HOME = tmpHome;

    const vaultPath = '/tmp/project_di';
    const sessionId = 'session-123';
    const sessionDirName = '--tmp-project_di--';
    const sessionDir = path.join(tmpHome, '.pi', 'agent', 'sessions', sessionDirName);
    fs.mkdirSync(sessionDir, { recursive: true });

    const sessionFile = path.join(sessionDir, `2026-04-09T00-00-00-000Z_${sessionId}.jsonl`);
    fs.writeFileSync(
      sessionFile,
      [
        JSON.stringify({ type: 'session', id: sessionId, cwd: vaultPath }),
        JSON.stringify({
          type: 'message',
          id: 'u1',
          timestamp: '2026-04-09T00:00:00.000Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: '续写接下来的情节\n\n<current_note>\n第一章.md\n</current_note>' }],
            timestamp: 1712620800000,
          },
        }),
        JSON.stringify({
          type: 'message',
          id: 'a1',
          timestamp: '2026-04-09T00:00:01.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'internal' },
              { type: 'text', text: '你好，我在。' },
            ],
            timestamp: 1712620801000,
          },
        }),
      ].join('\n'),
      'utf-8',
    );

    const service = new PiConversationHistoryService();
    const conversation = makeConversation(sessionId);

    await service.hydrateConversationHistory(conversation, vaultPath);

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].role).toBe('user');
    expect(conversation.messages[0].content).toContain('<current_note>');
    expect(conversation.messages[0].displayContent).toBe('续写接下来的情节');
    expect(conversation.messages[1].role).toBe('assistant');
    expect(conversation.messages[1].content).toBe('你好，我在。');
    expect(conversation.providerState).toEqual({ sessionFilePath: sessionFile });
  });
});
