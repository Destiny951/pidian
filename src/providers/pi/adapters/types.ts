export interface AssistantMessageEventDelta {
  type: 'text_delta' | 'thinking_delta';
  delta: string;
}

export interface AssistantMessageEventToolcall {
  type: 'toolcall_start' | 'toolcall_delta' | 'toolcall_end';
  toolCallId: string;
  toolCall?: {
    name: string;
    arguments: string;
  };
  delta?: string;
}

export interface AssistantMessageEvent {
  type: 'thinking_start' | 'thinking_delta' | 'thinking_end' |
        'toolcall_start' | 'toolcall_delta' | 'toolcall_end' |
        'text_start' | 'text_delta' | 'text_end';
  delta?: string;
  toolCallId?: string;
  toolCall?: {
    name: string;
    arguments: string;
  };
}

export interface PiContextUsageEvent {
  type: 'context_usage';
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export type PiEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start' }
  | { type: 'message_start'; messageId: string }
  | { type: 'message_end'; messageId: string }
  | { type: 'message_update'; messageId: string; assistantMessageEvent: AssistantMessageEvent }
  | { type: 'turn_end' }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args?: Record<string, unknown> }
  | { type: 'tool_execution_end'; toolCallId: string; toolName?: string; result: unknown; isError?: boolean }
  | { type: 'context_usage'; tokens: number | null; contextWindow: number; percent: number | null }
  | { type: 'agent_end' };

export type PiEventListener = (event: PiEvent) => void;
