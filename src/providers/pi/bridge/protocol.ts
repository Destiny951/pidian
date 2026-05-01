import type { PiEvent } from '../adapters/types';

export interface PiSkillInfo {
  name: string;
  description?: string;
  source: 'extension' | 'prompt' | 'skill';
  sourceInfo?: {
    path?: string;
  };
}

export interface PiContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface PiSessionStats {
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: PiContextUsage;
}

export interface PiToolApprovalPreview {
  filePath: string;
  absolutePath: string;
  operation: 'edit' | 'write' | 'create';
  originalContent: string;
  proposedContent: string;
  diffLines: Array<{
    type: 'equal' | 'insert' | 'delete';
    text: string;
    oldLineNum?: number;
    newLineNum?: number;
  }>;
  stats: {
    added: number;
    removed: number;
  };
  error?: string;
}

export type PiToolApprovalDecision = 'approve' | 'reject' | 'cancel';

export interface PiToolApprovalRequest {
  approvalId: string;
  toolCallId: string;
  toolName: 'edit' | 'write';
  input: Record<string, unknown>;
  preview: PiToolApprovalPreview;
}

export interface PiToolApprovalResponse {
  decision: PiToolApprovalDecision;
  reason?: string;
  editedContent?: string;
}

export type BridgeRequest =
  | { type: 'init'; id: string; cwd: string; sessionId?: string }
  | { type: 'prompt'; id: string; prompt: string }
  | { type: 'cancel'; id: string }
  | { type: 'reset'; id: string }
  | { type: 'list_skills'; id: string }
  | { type: 'discover_skills'; id: string; cwd: string }
  | { type: 'get_context_usage'; id: string }
  | { type: 'get_session_stats'; id: string }
  | { type: 'compact'; id: string; customInstructions?: string }
  | { type: 'tool_approval_response'; id: string; approvalId: string; decision: PiToolApprovalDecision; reason?: string; editedContent?: string }
  | { type: 'list_models'; id: string; cwd?: string }
  | { type: 'set_model'; id: string; provider: string; modelId: string; cwd?: string };

export interface PiModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export type BridgeResponse =
  | { type: 'init_ok'; id: string; sessionId: string | null }
  | { type: 'prompt_event'; id: string; event: PiEvent }
  | { type: 'prompt_done'; id: string }
  | { type: 'cancel_ok'; id: string }
  | { type: 'reset_ok'; id: string }
  | { type: 'list_skills_ok'; id: string; skills: PiSkillInfo[] }
  | { type: 'context_usage'; id: string; usage: PiContextUsage | null }
  | { type: 'session_stats'; id: string; stats: PiSessionStats }
  | { type: 'compact_done'; id: string; result: { tokensBefore: number; estimatedTokensAfter: number | null; summary?: string; usage?: PiContextUsage | null; _diagnostics?: { modelId: string; hasAgentYaml: boolean; summaryLength: number; messagesCount: number; firstKeptEntryId?: string | null } } }
  | ({ type: 'tool_approval_request'; id: string } & PiToolApprovalRequest)
  | { type: 'list_models_ok'; id: string; models: PiModelInfo[]; defaultProvider: string | null; defaultModel: string | null }
  | { type: 'set_model_ok'; id: string }
  | { type: 'error'; id?: string; message: string };
