import { getVaultPath } from '@/utils/path';

jest.mock('@/utils/path', () => ({
  getVaultPath: jest.fn(() => '/test/vault'),
}));

import type { StreamChunk } from '@/core/types/chat';
import { PiChatRuntime } from '@/providers/pi/runtime/PiChatRuntime';

const mockPlugin = {
  app: {
    vault: {
      getPath: () => '/test/vault',
    },
  },
} as any;

describe('PiChatRuntime', () => {
  beforeEach(() => {
    (getVaultPath as jest.Mock).mockReturnValue('/test/vault');
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
      expect(turn.persistedContent).toBe('');
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
});
