import { getVaultPath } from '@/utils/path';

jest.mock('@/utils/path', () => ({
  getVaultPath: jest.fn(() => '/test/vault'),
}));

import type { StreamChunk } from '@/core/types/chat';
import { PiBridgeClient } from '@/providers/pi/bridge/PiBridgeClient';
import { PiChatRuntime } from '@/providers/pi/runtime/PiChatRuntime';

const mockPlugin = {
  app: {
    vault: {
      getPath: () => '/test/vault',
    },
  },
  settings: {
    permissionMode: 'normal',
  },
  getActiveEnvironmentVariables: () => '',
} as any;

describe('PiChatRuntime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    (getVaultPath as jest.Mock).mockReturnValue('/test/vault');
    jest.spyOn(PiBridgeClient.prototype, 'listModels').mockResolvedValue({
      models: [],
      defaultProvider: null,
      defaultModel: null,
    });
  });

  describe('prepareTurn', () => {
    it('should create PreparedChatTurn from request', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const turn = runtime.prepareTurn({
        text: 'Hello world',
      });

      expect(turn.prompt).toBe('Hello world');
      expect(turn.request.text).toBe('Hello world');
      expect(turn.isCompact).toBe(false);
      expect(turn.persistedContent).toBe('Hello world');
    });

    it('should include note and selection contexts in prompt', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const turn = runtime.prepareTurn({
        text: '将我选中的文本换成2',
        currentNotePath: '第一章 测试.md',
        editorSelection: {
          notePath: '第一章 测试.md',
          mode: 'selection',
          selectedText: '11111\n111',
        },
        browserSelection: {
          source: 'browser',
          selectedText: 'browser text',
          url: 'https://example.com',
        },
        canvasSelection: {
          canvasPath: '画布.canvas',
          nodeIds: ['node-1', 'node-2'],
        },
      });

      expect(turn.prompt).toContain('将我选中的文本换成2');
      expect(turn.prompt).toContain('<current_note>\n第一章 测试.md\n</current_note>');
      expect(turn.prompt).toContain('<editor_selection path="第一章 测试.md">\n11111\n111\n</editor_selection>');
      expect(turn.prompt).toContain('<browser_selection source="browser" url="https://example.com">\nbrowser text\n</browser_selection>');
      expect(turn.prompt).toContain('<canvas_selection path="画布.canvas">\nnode-1, node-2\n</canvas_selection>');
    });
  });

  describe('getCapabilities', () => {
    it('should return PI capabilities', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const caps = runtime.getCapabilities();

      expect(caps.providerId).toBe('pi');
      expect(caps.supportsPersistentRuntime).toBe(true);
      expect(caps.supportsPlanMode).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return false initially', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(runtime.isReady()).toBe(false);
    });
  });

  describe('session sync', () => {
    it('should restore target session id via bridge on ensureReady', async () => {
      const ensureSpy = jest
        .spyOn(PiBridgeClient.prototype, 'ensureReady')
        .mockResolvedValue('pi-session-123');

      const runtime = new PiChatRuntime(mockPlugin);
      runtime.syncConversationState({ sessionId: 'pi-session-123', providerState: {} });

      const ready = await runtime.ensureReady();

      expect(ready).toBe(true);
      expect(ensureSpy).toHaveBeenCalledWith('/test/vault', 'pi-session-123');
      expect(runtime.getSessionId()).toBe('pi-session-123');
    });
  });

  describe('getSessionId', () => {
    it('should return null initially', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(runtime.getSessionId()).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should not throw', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(() => runtime.cleanup()).not.toThrow();
    });
  });

  describe('cancel', () => {
    it('should not throw when session is null', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(() => runtime.cancel()).not.toThrow();
    });
  });

  describe('edit approval', () => {
    const approvalRequest = {
      approvalId: 'approval-1',
      toolCallId: 'tool-1',
      toolName: 'edit' as const,
      input: { path: 'note.md', edits: [{ oldText: 'old', newText: 'new' }] },
      preview: {
        filePath: 'note.md',
        absolutePath: '/test/vault/note.md',
        operation: 'edit' as const,
        originalContent: 'old',
        proposedContent: 'new',
        diffLines: [
          { type: 'delete' as const, text: 'old', oldLineNum: 1 },
          { type: 'insert' as const, text: 'new', newLineNum: 1 },
        ],
        stats: { added: 1, removed: 1 },
      },
    };

    it('approves through the registered approval callback in normal mode', async () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const callback = jest.fn().mockResolvedValue('allow');
      runtime.setApprovalCallback(callback);

      const result = await (runtime as any).bridge.onToolApprovalRequest(approvalRequest);

      expect(result).toEqual({ decision: 'approve', editedContent: 'new' });
      expect(callback).toHaveBeenCalledWith(
        'Edit',
        approvalRequest.input,
        'PI wants to edit note.md (+1 -1).',
        expect.objectContaining({
          blockedPath: 'note.md',
          additionalPermissions: expect.objectContaining({
            provider: 'pi',
            kind: 'file-mutation-preview',
          }),
        }),
      );
    });

    it('allows without prompting in yolo mode', async () => {
      const runtime = new PiChatRuntime({
        ...mockPlugin,
        settings: { permissionMode: 'yolo' },
      } as any);
      const callback = jest.fn().mockResolvedValue('deny');
      runtime.setApprovalCallback(callback);

      const result = await (runtime as any).bridge.onToolApprovalRequest(approvalRequest);

      expect(result).toEqual({ decision: 'approve' });
      expect(callback).not.toHaveBeenCalled();
    });

    it('blocks file mutation in plan mode', async () => {
      const runtime = new PiChatRuntime({
        ...mockPlugin,
        settings: { permissionMode: 'plan' },
      } as any);

      const result = await (runtime as any).bridge.onToolApprovalRequest(approvalRequest);

      expect(result.decision).toBe('reject');
      expect(result.reason).toContain('plan mode');
    });
  });

  describe('setModel', () => {
    it('updates PI default model and resets the active bridge session', async () => {
      const setModelSpy = jest.spyOn(PiBridgeClient.prototype, 'setModel').mockResolvedValue(undefined);
      const resetSpy = jest.spyOn(PiBridgeClient.prototype, 'reset').mockResolvedValue(undefined);
      const listModelsSpy = jest.spyOn(PiBridgeClient.prototype, 'listModels').mockResolvedValue({
        models: [],
        defaultProvider: 'minimax-cn',
        defaultModel: 'MiniMax-M2.7',
      });

      const runtime = new PiChatRuntime(mockPlugin);
      await runtime.setModel('minimax-cn', 'MiniMax-M2.7');

      expect(setModelSpy).toHaveBeenCalledWith('minimax-cn', 'MiniMax-M2.7');
      expect(resetSpy).toHaveBeenCalled();
      expect(listModelsSpy).toHaveBeenCalled();
      expect(runtime.isReady()).toBe(false);
      expect(runtime.getSessionId()).toBeNull();
    });

    it('preserves the target PI session id across model switches', async () => {
      const ensureSpy = jest.spyOn(PiBridgeClient.prototype, 'ensureReady').mockResolvedValue('pi-session-123');
      jest.spyOn(PiBridgeClient.prototype, 'setModel').mockResolvedValue(undefined);
      jest.spyOn(PiBridgeClient.prototype, 'reset').mockResolvedValue(undefined);

      const runtime = new PiChatRuntime(mockPlugin);
      runtime.syncConversationState({ sessionId: 'pi-session-123', providerState: {} });
      await runtime.ensureReady();
      await runtime.setModel('minimax-cn', 'MiniMax-M2.7');
      await runtime.ensureReady();

      expect(ensureSpy).toHaveBeenLastCalledWith('/test/vault', 'pi-session-123');
    });
  });

  describe('resetSession', () => {
    it('should reset ready state', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      runtime.resetSession();
      expect(runtime.isReady()).toBe(false);
    });
  });

  describe('query with mock', () => {
    it('should yield error when ensureReady returns false', async () => {
      (getVaultPath as jest.Mock).mockReturnValue(null);

      const runtime = new PiChatRuntime(mockPlugin);
      const turn = runtime.prepareTurn({ text: 'test' });

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.query(turn)) {
        chunks.push(chunk);
        if (chunk.type === 'done') break;
      }

      expect(chunks).toEqual([{ type: 'error', content: 'PI session failed to initialize' }]);
    });

    it('should keep draining chunks after agent_end so final usage is emitted', async () => {
      jest.spyOn(PiBridgeClient.prototype, 'ensureReady').mockResolvedValue('pi-session-123');
      jest.spyOn(PiBridgeClient.prototype, 'prompt').mockImplementation(async (_prompt, onEvent) => {
        onEvent({ type: 'message_update', messageId: 'm1', assistantMessageEvent: { type: 'text_delta', delta: 'done' } });
        onEvent({ type: 'agent_end' });
        onEvent({ type: 'context_usage', tokens: 42000, contextWindow: 200000, percent: 21 });
      });

      const runtime = new PiChatRuntime(mockPlugin);
      const turn = runtime.prepareTurn({ text: 'test' });

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.query(turn)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'text', content: 'done' },
        {
          type: 'usage',
          usage: {
            inputTokens: 42000,
            contextWindow: 200000,
            contextTokens: 42000,
            percentage: 21,
          },
        },
      ]);
    });
  });

  describe('stub methods', () => {
    it('should return empty array for getSupportedCommands', async () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const commands = await runtime.getSupportedCommands();
      expect(commands).toEqual([]);
    });

    it('should return false for consumeSessionInvalidation', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(runtime.consumeSessionInvalidation()).toBe(false);
    });

    it('should return empty metadata for consumeTurnMetadata', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(runtime.consumeTurnMetadata()).toEqual({});
    });

    it('should return null for resolveSessionIdForFork', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      expect(runtime.resolveSessionIdForFork(null)).toBeNull();
    });

    it('should return rewind not supported', async () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const result = await runtime.rewind('user-id', 'assistant-id');
      expect(result.canRewind).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('should return empty updates for buildSessionUpdates', () => {
      const runtime = new PiChatRuntime(mockPlugin);
      const result = runtime.buildSessionUpdates({ conversation: null, sessionInvalidated: false });
      expect(result.updates.sessionId).toBeNull();
    });
  });

  describe('getContextUsage', () => {
    it('should preserve unknown usage reported after compaction', async () => {
      jest.spyOn(PiBridgeClient.prototype, 'ensureReady').mockResolvedValue('pi-session-123');
      jest.spyOn(PiBridgeClient.prototype, 'getContextUsage').mockResolvedValue({
        tokens: null,
        contextWindow: 200000,
        percent: null,
      });

      const runtime = new PiChatRuntime(mockPlugin);
      const usage = await runtime.getContextUsage();

      expect(usage).toEqual({
        inputTokens: null,
        contextWindow: 200000,
        contextTokens: null,
        percentage: null,
        contextWindowIsAuthoritative: true,
      });
    });
  });
});
