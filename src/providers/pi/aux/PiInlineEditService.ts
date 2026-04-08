import * as path from 'path';
import { pathToFileURL } from 'url';

import {
  buildInlineEditPrompt,
  getInlineEditSystemPrompt,
  parseInlineEditResponse,
} from '../../../core/prompt/inlineEdit';
import type {
  InlineEditRequest,
  InlineEditResult,
  InlineEditService,
} from '../../../core/providers/types';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import type { PiEvent } from '../adapters/types';

const PI_SDK_PATH = '/Users/zl-q/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/dist/index.js';

export class PiInlineEditService implements InlineEditService {
  private plugin: ClaudianPlugin;
  private abortController: AbortController | null = null;
  private session: any = null;
  private sessionReady = false;

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    this.session = null;
    this.sessionReady = false;
  }

  async editText(request: InlineEditRequest): Promise<InlineEditResult> {
    this.resetConversation();
    const prompt = buildInlineEditPrompt(request);
    return this.sendMessage(prompt);
  }

  async continueConversation(
    message: string,
    _contextFiles?: string[],
  ): Promise<InlineEditResult> {
    if (!this.session) {
      return { success: false, error: 'No active conversation to continue' };
    }
    return this.sendMessage(message);
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.session) {
      void this.session.abort();
    }
  }

  private async ensureSession(): Promise<boolean> {
    if (this.sessionReady && this.session) return true;

    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) return false;

    try {
      const sdkUrl = pathToFileURL(PI_SDK_PATH).href;
      const { createAgentSession, DefaultResourceLoader, SettingsManager, readTool, grepTool, findTool, lsTool, bashTool } =
        await import(sdkUrl);

      const agentDir = path.join(process.env.HOME ?? '', '.pi/agent');
      const settingsManager = SettingsManager.inMemory();
      const resourceLoader = new DefaultResourceLoader({
        cwd: vaultPath,
        agentDir,
        settingsManager,
        systemPrompt: getInlineEditSystemPrompt(),
        noExtensions: false,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await resourceLoader.reload();

      const { session } = await createAgentSession({
        cwd: vaultPath,
        resourceLoader,
        tools: [readTool, grepTool, findTool, lsTool, bashTool],
      });

      this.session = session;
      this.sessionReady = true;
      return true;
    } catch (error) {
      console.error('[PiInlineEditService] Failed to create session:', error);
      return false;
    }
  }

  private async sendMessage(prompt: string): Promise<InlineEditResult> {
    const ready = await this.ensureSession();
    if (!ready) {
      return { success: false, error: 'Failed to initialize PI session' };
    }

    const session = this.session;
    const chunks: string[] = [];
    let resolveChunk: ((chunk: string) => void) | null = null;
    const pending: string[] = [];

    const unsubscribe = session.subscribe((event: PiEvent) => {
      if (event.type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent?.type === 'text_delta' && assistantEvent.delta) {
          const delta = assistantEvent.delta;
          if (resolveChunk) {
            resolveChunk(delta);
            resolveChunk = null;
          } else {
            pending.push(delta);
          }
        }
      }
      if (event.type === 'agent_end') {
        resolveChunk?.('');
      }
    });

    try {
      const promptPromise = session.prompt(prompt);

      while (true) {
        if (pending.length > 0) {
          chunks.push(pending.shift()!);
        } else {
          const waitForChunk = new Promise<string>((resolve) => {
            resolveChunk = resolve;
          });
          const chunk = await waitForChunk;
          if (chunk === '') break;
          chunks.push(chunk);
        }
      }

      await promptPromise;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    } finally {
      unsubscribe();
    }

    const fullResponse = chunks.join('');
    return parseInlineEditResponse(fullResponse);
  }
}
