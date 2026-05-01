import type { ProviderCapabilities, ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnResult,
  ChatRewindResult,
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  ExitPlanModeCallback,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import type { ChatMessage, Conversation, SlashCommand, StreamChunk, UsageInfo } from '../../../core/types';
import type PidianPlugin from '../../../main';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { getVaultPath } from '../../../utils/path';
import { PiEventAdapter } from '../adapters/PiEventAdapter';
import type { PiEvent } from '../adapters/types';
import { PiBridgeClient } from '../bridge/PiBridgeClient';
import type { PiContextUsage, PiToolApprovalRequest, PiToolApprovalResponse } from '../bridge/protocol';
import { PI_PROVIDER_CAPABILITIES } from '../capabilities';
import { cachePiModels } from '../ui/PiChatUIConfig';

export class PiChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'pi';

  private plugin: PidianPlugin;
  private bridge: PiBridgeClient;
  private adapter: PiEventAdapter;
  private pendingChunks: StreamChunk[] = [];
  private resolveChunk: ((chunk: StreamChunk | null) => void) | null = null;
  private ready = false;
  private desiredSessionId: string | null = null;
  private sessionId: string | null = null;
  private pendingInitUsage: UsageInfo | null = null;
  private approvalCallback: ApprovalCallback | null = null;
  private approvalDismisser: (() => void) | null = null;
  private modelCacheInitialized = false;

  private mapPiUsage(usage: PiContextUsage | null | undefined): UsageInfo | null {
    if (!usage) {
      return null;
    }

    return {
      inputTokens: usage.tokens,
      contextWindow: usage.contextWindow,
      contextTokens: usage.tokens,
      percentage: usage.percent,
      contextWindowIsAuthoritative: true,
    };
  }

  private async handleToolApprovalRequest(request: PiToolApprovalRequest): Promise<PiToolApprovalResponse> {
    const filePath = request.preview.filePath || String(request.input.path ?? 'file');

    if (this.plugin.settings.permissionMode === 'yolo') {
      return { decision: 'approve' };
    }

    if (this.plugin.settings.permissionMode === 'plan') {
      return {
        decision: 'reject',
        reason: `File mutation blocked in plan mode: ${filePath}. Present the proposed change in the plan instead.`,
      };
    }

    if (request.preview.error) {
      return {
        decision: 'reject',
        reason: `Edit preview failed for ${filePath}: ${request.preview.error}`,
      };
    }

    if (!this.approvalCallback) {
      return {
        decision: 'reject',
        reason: 'No approval handler is available.',
      };
    }

    const toolName = request.toolName === 'write' ? 'Write' : 'Edit';
    const stats = request.preview.stats;
    const action = request.preview.operation === 'create' ? 'create' : request.toolName;
    const decision = await this.approvalCallback(
      toolName,
      request.input,
      `PI wants to ${action} ${filePath} (+${stats.added} -${stats.removed}).`,
      {
        blockedPath: filePath,
        additionalPermissions: {
          provider: 'pi',
          kind: 'file-mutation-preview',
          request,
        },
        decisionOptions: [
          { label: 'Reject', value: 'reject', decision: 'deny' },
          { label: 'Approve', value: 'approve', decision: 'allow' },
        ],
      },
    );

    if (decision === 'allow' || decision === 'allow-always') {
      return { decision: 'approve', editedContent: request.preview.proposedContent };
    }

    if (decision === 'cancel') {
      return {
        decision: 'cancel',
        reason: 'User cancelled the edit approval.',
      };
    }

    return {
      decision: 'reject',
      reason: `User rejected the proposed ${request.toolName} to ${filePath}.`,
    };
  }

  constructor(plugin: PidianPlugin) {
    this.plugin = plugin;
    this.bridge = new PiBridgeClient(plugin);
    this.adapter = new PiEventAdapter();
    this.bridge.onInitContextUsage = (piUsage) => {
      this.pendingInitUsage = this.mapPiUsage(piUsage);
    };
    this.bridge.onToolApprovalRequest = (request) => this.handleToolApprovalRequest(request);
  }

  private async initializeModelCache(): Promise<void> {
    if (this.modelCacheInitialized) return;
    
    try {
      const { models, defaultProvider, defaultModel } = await this.bridge.listModels();
      cachePiModels(models, defaultProvider ?? undefined, defaultModel ?? undefined);
      this.modelCacheInitialized = true;
    } catch (error) {
      console.error('[PiChatRuntime] Failed to cache models:', error);
    }
  }

  getCapabilities(): Readonly<ProviderCapabilities> {
    return PI_PROVIDER_CAPABILITIES;
  }

  async ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    const force = options?.force === true;

    if (!force && this.ready && this.sessionId === this.desiredSessionId) return true;

    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) return false;

    try {
      if (force) {
        this.ready = false;
        this.sessionId = null;
        await this.bridge.reset();
      }

      const resolvedSessionId = await this.bridge.ensureReady(vaultPath, this.desiredSessionId ?? undefined);
      this.sessionId = resolvedSessionId;
      this.ready = true;
      
      if (!this.modelCacheInitialized) {
        await this.initializeModelCache();
      }
      
      return true;
    } catch (error) {
      console.error('[PiChatRuntime] Failed to create session:', error);
      return false;
    }
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    let persistedContent = request.text;

    if (request.currentNotePath) {
      persistedContent = appendCurrentNote(persistedContent, request.currentNotePath);
    }

    if (request.editorSelection) {
      persistedContent = appendEditorContext(persistedContent, request.editorSelection);
    }

    if (request.browserSelection) {
      persistedContent = appendBrowserContext(persistedContent, request.browserSelection);
    }

    if (request.canvasSelection) {
      persistedContent = appendCanvasContext(persistedContent, request.canvasSelection);
    }

    return {
      request,
      prompt: persistedContent,
      persistedContent,
      isCompact: false,
      mcpMentions: new Set(),
    };
  }

  async *query(
    turn: PreparedChatTurn,
    _conversationHistory?: ChatMessage[],
    _queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    if (!this.ready) {
      const ready = await this.ensureReady();
      if (!ready) {
        yield { type: 'error', content: 'PI session failed to initialize' };
        return;
      }
    }

    // Send pending init usage before starting the stream
    // This captures context usage from restored sessions
    if (this.pendingInitUsage) {
      yield { type: 'usage', usage: this.pendingInitUsage };
      this.pendingInitUsage = null;
    }

    this.pendingChunks = [];
    this.resolveChunk = null;

    const handleEvent = (event: PiEvent): void => {
      const chunk = this.adapter.toStreamChunk(event);
      if (chunk) {
        if (this.resolveChunk) {
          this.resolveChunk(chunk);
          this.resolveChunk = null;
        } else {
          this.pendingChunks.push(chunk);
        }
      }
    };

    try {
      let promptSettled = false;
      const promptPromise = this.bridge.prompt(turn.prompt, handleEvent).finally(() => {
        promptSettled = true;
        if (this.resolveChunk) {
          this.resolveChunk(null);
          this.resolveChunk = null;
        }
      });

      while (true) {
        if (this.pendingChunks.length > 0) {
          const chunk = this.pendingChunks.shift()!;
          yield chunk;
        } else if (promptSettled) {
          break;
        } else {
          const waitForChunk = new Promise<StreamChunk | null>((resolve) => {
            this.resolveChunk = resolve;
          });
          const chunk = await waitForChunk;
          if (chunk) {
            yield chunk;
          }
        }
      }

      await promptPromise;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    } finally {
      this.pendingChunks = [];
      this.resolveChunk = null;
    }
  }

  cancel(): void {
    this.approvalDismisser?.();
    void this.bridge.cancel();
  }

  resetSession(): void {
    this.ready = false;
    this.sessionId = null;
    this.desiredSessionId = null;
    void this.bridge.reset();
  }

  cleanup(): void {
    this.cancel();
    this.resetSession();
    this.bridge.dispose();
    this.ready = false;
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isReady(): boolean {
    return this.ready;
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    return () => {};
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(
    conversation: ChatRuntimeConversationState | null,
    _externalContextPaths?: string[],
  ): void {
    const nextSessionId = conversation?.sessionId ?? null;
    this.desiredSessionId = nextSessionId;
    if (this.sessionId !== nextSessionId) {
      this.ready = false;
    }
  }

  reloadMcpServers(): Promise<void> {
    return Promise.resolve();
  }

  consumeSessionInvalidation(): boolean {
    return false;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [];
  }

  rewind(_userMessageId: string, _assistantMessageId: string): Promise<ChatRewindResult> {
    return Promise.resolve({ canRewind: false, error: 'Rewind not supported for PI provider' });
  }

  setApprovalCallback(callback: ApprovalCallback | null): void {
    this.approvalCallback = callback;
  }

  setApprovalDismisser(dismisser: (() => void) | null): void {
    this.approvalDismisser = dismisser;
  }

  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}

  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}

  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}

  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}

  setAutoTurnCallback(_callback: ((result: AutoTurnResult) => void) | null): void {}

  consumeTurnMetadata(): ChatTurnMetadata {
    return {};
  }

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    const existingSessionId = params.conversation?.sessionId ?? null;
    const runtimeSessionId = this.getSessionId();

    return {
      updates: {
        sessionId: runtimeSessionId ?? (params.sessionInvalidated ? null : existingSessionId),
        providerState: params.sessionInvalidated ? undefined : params.conversation?.providerState,
      },
    };
  }

  resolveSessionIdForFork(_conversation: Conversation | null): string | null {
    return this.getSessionId();
  }

  async getContextUsage(): Promise<UsageInfo | null> {
    if (!this.ready) {
      const ready = await this.ensureReady();
      if (!ready) {
        return null;
      }
    }

    try {
      const usage = await this.bridge.getContextUsage();
      return this.mapPiUsage(usage);
    } catch (error) {
      console.error('[PiChatRuntime] Failed to get context usage:', error);
      return null;
    }
  }

  async compact(customInstructions?: string): Promise<{ tokensBefore: number; estimatedTokensAfter: number | null; summary?: string; usage?: UsageInfo | null } | null> {
    if (!this.ready) {
      const ready = await this.ensureReady();
      if (!ready) {
        return null;
      }
    }

    try {
      const result = await this.bridge.compact(customInstructions);
      return {
        ...result,
        usage: this.mapPiUsage(result.usage),
      };
    } catch (error) {
      console.error('[PiChatRuntime] Failed to compact:', error);
      throw error;
    }
  }

  async setModel(provider: string, modelId: string): Promise<void> {
    try {
      const sessionToRestore = this.desiredSessionId ?? this.sessionId;
      await this.bridge.setModel(provider, modelId);
      
      this.ready = false;
      this.sessionId = null;
      this.desiredSessionId = sessionToRestore;
      this.modelCacheInitialized = false;
      
      await this.bridge.reset();
      
      await this.initializeModelCache();
    } catch (error) {
      console.error('[PiChatRuntime] Failed to set model:', error);
      throw error;
    }
  }
}
