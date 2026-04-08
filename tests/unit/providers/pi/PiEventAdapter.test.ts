import { PiEventAdapter } from '@/providers/pi/adapters/PiEventAdapter';
import type { PiEvent } from '@/providers/pi/adapters/types';

describe('PiEventAdapter', () => {
  let adapter: PiEventAdapter;

  beforeEach(() => {
    adapter = new PiEventAdapter();
  });

  describe('text_delta', () => {
    it('should convert text_delta to StreamChunk', () => {
      const event: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: 'Hello world',
        },
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({ type: 'text', content: 'Hello world' });
    });

    it('should handle empty delta', () => {
      const event: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: '',
        },
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({ type: 'text', content: '' });
    });
  });

  describe('thinking_delta', () => {
    it('should convert thinking_delta to thinking StreamChunk', () => {
      const event: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'thinking_delta',
          delta: 'Let me think...',
        },
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({ type: 'thinking', content: 'Let me think...' });
    });
  });

  describe('toolcall events', () => {
    it('should buffer toolcall_start', () => {
      const startEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_start',
          toolCallId: 'tool-1',
          toolCall: { name: 'read', arguments: '' },
        },
      };

      const deltaEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_delta',
          toolCallId: 'tool-1',
          delta: '{"path":"test.md"}',
        },
      };

      adapter.toStreamChunk(startEvent);
      const result = adapter.toStreamChunk(deltaEvent);

      expect(result).toBeNull();
    });

    it('should return null for toolcall_end', () => {
      const event: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_end',
          toolCallId: 'tool-1',
        },
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toBeNull();
    });
  });

  describe('tool_execution_start', () => {
    it('should convert to tool_use StreamChunk', () => {
      const toolCallEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_start',
          toolCallId: 'tool-1',
          toolCall: { name: 'read', arguments: '' },
        },
      };

      const startEvent: PiEvent = {
        type: 'tool_execution_start',
        toolUseId: 'tool-1',
        toolName: 'read',
      };

      adapter.toStreamChunk(toolCallEvent);
      const chunk = adapter.toStreamChunk(startEvent);

      expect(chunk).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'read',
        input: {},
      });
    });

    it('should parse JSON arguments', () => {
      const toolCallEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_start',
          toolCallId: 'tool-1',
          toolCall: { name: 'read', arguments: '' },
        },
      };

      const deltaEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_delta',
          toolCallId: 'tool-1',
          delta: '{"path":"notes/test.md","fromLine":1}',
        },
      };

      const startEvent: PiEvent = {
        type: 'tool_execution_start',
        toolUseId: 'tool-1',
        toolName: 'read',
      };

      adapter.toStreamChunk(toolCallEvent);
      adapter.toStreamChunk(deltaEvent);
      const chunk = adapter.toStreamChunk(startEvent);

      expect(chunk).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'read',
        input: { path: 'notes/test.md', fromLine: 1 },
      });
    });

    it('should handle non-JSON arguments as raw', () => {
      const toolCallEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_start',
          toolCallId: 'tool-1',
          toolCall: { name: 'bash', arguments: '' },
        },
      };

      const deltaEvent: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: {
          type: 'toolcall_delta',
          toolCallId: 'tool-1',
          delta: 'echo "hello world"',
        },
      };

      const startEvent: PiEvent = {
        type: 'tool_execution_start',
        toolUseId: 'tool-1',
        toolName: 'bash',
      };

      adapter.toStreamChunk(toolCallEvent);
      adapter.toStreamChunk(deltaEvent);
      const chunk = adapter.toStreamChunk(startEvent);

      expect(chunk).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'bash',
        input: { raw: 'echo "hello world"' },
      });
    });

    it('should handle unknown tool call id', () => {
      const startEvent: PiEvent = {
        type: 'tool_execution_start',
        toolUseId: 'unknown-tool',
        toolName: 'read',
      };

      const chunk = adapter.toStreamChunk(startEvent);

      expect(chunk).toEqual({
        type: 'tool_use',
        id: 'unknown-tool',
        name: 'read',
        input: {},
      });
    });
  });

  describe('tool_execution_end', () => {
    it('should convert to tool_result StreamChunk', () => {
      const event: PiEvent = {
        type: 'tool_execution_end',
        toolUseId: 'tool-1',
        result: 'file content here',
        isError: false,
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({
        type: 'tool_result',
        id: 'tool-1',
        content: 'file content here',
        isError: false,
      });
    });

    it('should handle error result', () => {
      const event: PiEvent = {
        type: 'tool_execution_end',
        toolUseId: 'tool-1',
        result: 'Error: file not found',
        isError: true,
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({
        type: 'tool_result',
        id: 'tool-1',
        content: 'Error: file not found',
        isError: true,
      });
    });

    it('should default isError to false', () => {
      const event: PiEvent = {
        type: 'tool_execution_end',
        toolUseId: 'tool-1',
        result: 'success',
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({
        type: 'tool_result',
        id: 'tool-1',
        content: 'success',
        isError: false,
      });
    });
  });

  describe('agent_end', () => {
    it('should convert to done StreamChunk', () => {
      const event: PiEvent = {
        type: 'agent_end',
      };

      const chunk = adapter.toStreamChunk(event);

      expect(chunk).toEqual({ type: 'done' });
    });
  });

  describe('unhandled events', () => {
    it('should return null for agent_start', () => {
      const event: PiEvent = { type: 'agent_start' };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });

    it('should return null for turn_start', () => {
      const event: PiEvent = { type: 'turn_start' };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });

    it('should return null for turn_end', () => {
      const event: PiEvent = { type: 'turn_end' };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });

    it('should return null for message_start', () => {
      const event: PiEvent = { type: 'message_start', messageId: 'msg-1' };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });

    it('should return null for message_end', () => {
      const event: PiEvent = { type: 'message_end', messageId: 'msg-1' };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });

    it('should return null for message_update without assistantMessageEvent', () => {
      const event: PiEvent = {
        type: 'message_update',
        messageId: 'msg-1',
        assistantMessageEvent: undefined as any,
      };
      expect(adapter.toStreamChunk(event)).toBeNull();
    });
  });
});
