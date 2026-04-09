import type { StreamChunk } from '../../../core/types/chat';
import type { PiEvent } from './types';

export interface PiEventAdapterOptions {
  onToolUse?: (id: string, name: string, input: Record<string, unknown>) => void;
  onToolResult?: (id: string, content: string, isError: boolean) => void;
}

export class PiEventAdapter {
  private toolCallBuffers = new Map<string, { name: string; args: string }>();
  private executionToToolCallId = new Map<string, string>();

  private findBufferedToolCallIdByName(name?: string): string | null {
    if (!name) {
      return null;
    }

    for (const [toolCallId, buffer] of this.toolCallBuffers.entries()) {
      if (buffer.name === name) {
        return toolCallId;
      }
    }

    return null;
  }

  private normalizeToolArgs(args: unknown): string {
    if (typeof args === 'string') {
      return args;
    }

    if (args == null) {
      return '';
    }

    try {
      return JSON.stringify(args);
    } catch {
      return String(args);
    }
  }

  private parseToolInput(args: string): Record<string, unknown> {
    try {
      return JSON.parse(args || '{}') as Record<string, unknown>;
    } catch {
      return { raw: args };
    }
  }

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
              args: this.normalizeToolArgs(assistantEvent.toolCall?.arguments),
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
          if (!assistantEvent.toolCallId) {
            return null;
          }

          const buffer = this.toolCallBuffers.get(assistantEvent.toolCallId);
          if (!buffer) {
            return null;
          }

          return {
            type: 'tool_use',
            id: assistantEvent.toolCallId,
            name: buffer.name,
            input: this.parseToolInput(buffer.args),
          };
        default:
          return null;
      }
    }

    if (event.type === 'tool_execution_start') {
      let canonicalId = event.toolUseId;
      if (!this.toolCallBuffers.has(canonicalId)) {
        const matchedToolCallId = this.findBufferedToolCallIdByName(event.toolName);
        if (matchedToolCallId) {
          canonicalId = matchedToolCallId;
          this.executionToToolCallId.set(event.toolUseId, matchedToolCallId);
        }
      }

      const buffer = this.toolCallBuffers.get(canonicalId) ?? { name: event.toolName, args: '' };
      return {
        type: 'tool_use',
        id: canonicalId,
        name: buffer.name,
        input: this.parseToolInput(buffer.args),
      };
    }

    if (event.type === 'tool_execution_end') {
      let canonicalId = this.executionToToolCallId.get(event.toolUseId) ?? event.toolUseId;
      if (!this.toolCallBuffers.has(canonicalId)) {
        const matchedToolCallId = this.findBufferedToolCallIdByName(event.toolName);
        if (matchedToolCallId) {
          canonicalId = matchedToolCallId;
        }
      }

      const buffer = this.toolCallBuffers.get(canonicalId);
      const toolName = buffer?.name ?? event.toolName;
      this.toolCallBuffers.delete(canonicalId);
      this.executionToToolCallId.delete(event.toolUseId);
      return {
        type: 'tool_result',
        id: canonicalId,
        name: toolName,
        content: this.normalizeToolResultContent(event.result),
        isError: event.isError ?? false,
      };
    }

    if (event.type === 'agent_end') {
      this.executionToToolCallId.clear();
      return { type: 'done' };
    }

    return null;
  }
}
