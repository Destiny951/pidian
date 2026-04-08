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
import type { ChatMessage, Conversation, SlashCommand, StreamChunk } from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { getVaultPath } from '../../../utils/path';
import { PiEventAdapter } from '../adapters/PiEventAdapter';
import type { PiEvent } from '../adapters/types';
import { PiBridgeClient } from '../bridge/PiBridgeClient';
import { PI_PROVIDER_CAPABILITIES } from '../capabilities';

export class PiChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'pi';

  private plugin: ClaudianPlugin;
  private bridge: PiBridgeClient;
  private adapter: PiEventAdapter;
  private pendingChunks: StreamChunk[] = [];
  private resolveChunk: ((chunk: StreamChunk) => void) | null = null;
  private ready = false;
  private desiredSessionId: string | null = null;
  private sessionId: string | null = null;

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
    this.bridge = new PiBridgeClient(plugin);
    this.adapter = new PiEventAdapter();
  }

  getCapabilities(): Readonly<ProviderCapabilities> {
    return PI_PROVIDER_CAPABILITIES;
  }

  async ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    if (this.ready && this.sessionId === this.desiredSessionId) return true;

    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) return false;

    try {
      const resolvedSessionId = await this.bridge.ensureReady(vaultPath, this.desiredSessionId ?? undefined);
      this.sessionId = resolvedSessionId;
      this.ready = true;
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
      const promptPromise = this.bridge.prompt(turn.prompt, handleEvent);

      while (true) {
        if (this.pendingChunks.length > 0) {
          const chunk = this.pendingChunks.shift()!;
          if (chunk.type === 'done') break;
          yield chunk;
        } else {
          const waitForChunk = new Promise<StreamChunk>((resolve) => {
            this.resolveChunk = resolve;
          });
          const chunk = await waitForChunk;
          if (chunk.type === 'done') break;
          yield chunk;
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

  setApprovalCallback(_callback: ApprovalCallback | null): void {}

  setApprovalDismisser(_dismisser: (() => void) | null): void {}

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
    return {
      updates: {
        sessionId: this.getSessionId(),
        providerState: params.sessionInvalidated ? undefined : params.conversation?.providerState,
      },
    };
  }

  resolveSessionIdForFork(_conversation: Conversation | null): string | null {
    return this.getSessionId();
  }
}
