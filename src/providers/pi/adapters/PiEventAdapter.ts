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
    if (
      event.type === 'tool_execution_start'
      || event.type === 'tool_execution_end'
      || event.type === 'message_update'
    ) {
      console.log('[PI_EVENT]', JSON.stringify(event));
    }

    if (event.type === 'tool_execution_start') {
      console.log('[PI_ADAPTER] tool_execution_start:', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        bufferedIds: Array.from(this.toolCallBuffers.entries()).map(([id, b]) => ({ id, name: b.name })),
      });
    }

    if (event.type === 'tool_execution_end') {
      console.log('[PI_ADAPTER] tool_execution_end:', {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        bufferedIds: Array.from(this.toolCallBuffers.entries()).map(([id, b]) => ({ id, name: b.name })),
      });
    }

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
      let canonicalId = event.toolCallId;
      if (!this.toolCallBuffers.has(canonicalId)) {
        const matchedToolCallId = this.findBufferedToolCallIdByName(event.toolName);
        if (matchedToolCallId) {
          canonicalId = matchedToolCallId;
          this.executionToToolCallId.set(event.toolCallId, matchedToolCallId);
        }
      }

      const buffer = this.toolCallBuffers.get(canonicalId);
      const fallbackArgs = event.args ? JSON.stringify(event.args) : '';
      const toolName = buffer?.name ?? event.toolName ?? 'unknown';
      const toolArgs = buffer?.args ?? fallbackArgs;
      return {
        type: 'tool_use',
        id: canonicalId,
        name: toolName,
        input: this.parseToolInput(toolArgs),
      };
    }

    if (event.type === 'tool_execution_end') {
      let canonicalId = this.executionToToolCallId.get(event.toolCallId) ?? event.toolCallId;
      if (!this.toolCallBuffers.has(canonicalId)) {
        const matchedToolCallId = this.findBufferedToolCallIdByName(event.toolName);
        if (matchedToolCallId) {
          canonicalId = matchedToolCallId;
        }
      }

      const buffer = this.toolCallBuffers.get(canonicalId);
      const toolName = buffer?.name ?? event.toolName ?? 'unknown';
      console.log('[PI_ADAPTER] tool_result emitting:', { canonicalId, toolName, bufferExists: !!buffer });
      this.toolCallBuffers.delete(canonicalId);
      this.executionToToolCallId.delete(event.toolCallId);
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
