import type { StreamChunk } from '../../../core/types/chat';
import type { PiEvent } from './types';

export interface PiEventAdapterOptions {
  onToolUse?: (id: string, name: string, input: Record<string, unknown>) => void;
  onToolResult?: (id: string, content: string, isError: boolean) => void;
}

export class PiEventAdapter {
  private toolCallBuffers = new Map<string, { name: string; args: string }>();

  private normalizeToolResultContent(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result == null) {
      return '';
    }

    if (typeof result === 'number' || typeof result === 'boolean') {
      return String(result);
    }

    if (typeof result === 'object') {
      const rec = result as Record<string, unknown>;
      const preferred = rec.output ?? rec.result ?? rec.content ?? rec.text ?? rec.message;
      if (typeof preferred === 'string') {
        return preferred;
      }
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    }

    return String(result);
  }

  toStreamChunk(event: PiEvent): StreamChunk | null {
    if (event.type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (!assistantEvent) return null;

      switch (assistantEvent.type) {
        case 'text_delta':
          return { type: 'text', content: assistantEvent.delta ?? '' };
        case 'thinking_delta':
          return { type: 'thinking', content: assistantEvent.delta ?? '' };
        case 'toolcall_start':
          if (assistantEvent.toolCallId) {
            this.toolCallBuffers.set(assistantEvent.toolCallId, {
              name: assistantEvent.toolCall?.name ?? 'unknown',
              args: '',
            });
          }
          return null;
        case 'toolcall_delta':
          if (assistantEvent.delta && assistantEvent.toolCallId) {
            const buffer = this.toolCallBuffers.get(assistantEvent.toolCallId);
            if (buffer) {
              buffer.args += assistantEvent.delta;
            }
          }
          return null;
        case 'toolcall_end':
          return null;
        default:
          return null;
      }
    }

    if (event.type === 'tool_execution_start') {
      const buffer = this.toolCallBuffers.get(event.toolUseId) ?? { name: event.toolName, args: '' };
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(buffer.args || '{}');
      } catch {
        input = { raw: buffer.args };
      }
      return {
        type: 'tool_use',
        id: event.toolUseId,
        name: buffer.name,
        input,
      };
    }

    if (event.type === 'tool_execution_end') {
      return {
        type: 'tool_result',
        id: event.toolUseId,
        content: this.normalizeToolResultContent(event.result),
        isError: event.isError ?? false,
      };
    }

    if (event.type === 'agent_end') {
      return { type: 'done' };
    }

    return null;
  }
}
