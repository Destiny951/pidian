import { buildRefineSystemPrompt } from '../../../core/prompt/instructionRefine';
import type {
  InstructionRefineService,
  RefineProgressCallback,
} from '../../../core/providers/types';
import type { InstructionRefineResult } from '../../../core/types/settings';
import type PidianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import type { PiEvent } from '../adapters/types';
import { getDefaultPiAgentDir, resolvePiSdkUrl } from '../sdk/piRuntimePaths';

export class PiInstructionRefineService implements InstructionRefineService {
  private plugin: PidianPlugin;
  private abortController: AbortController | null = null;
  private session: any = null;
  private sessionReady = false;
  private existingInstructions: string = '';

  constructor(plugin: PidianPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    this.session = null;
    this.sessionReady = false;
  }

  async refineInstruction(
    rawInstruction: string,
    existingInstructions: string,
    _onProgress?: RefineProgressCallback,
  ): Promise<InstructionRefineResult> {
    this.resetConversation();
    this.existingInstructions = existingInstructions;
    const prompt = `Please refine this instruction: "${rawInstruction}"`;
    return this.sendMessage(prompt);
  }

  async continueConversation(
    message: string,
    _onProgress?: RefineProgressCallback,
  ): Promise<InstructionRefineResult> {
    if (!this.session) {
      return { success: false, error: 'No active conversation to continue' };
    }
    return this.sendMessage(message);
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.session) {
      void this.session.abort();
    }
  }

  private async ensureSession(systemPrompt: string): Promise<boolean> {
    if (this.sessionReady && this.session) return true;

    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) return false;

    try {
      const sdkUrl = await resolvePiSdkUrl();
      const { createAgentSession, DefaultResourceLoader, SettingsManager, bashTool } =
        await import(sdkUrl);

      const settingsManager = SettingsManager.inMemory();
      const resourceLoader = new DefaultResourceLoader({
        cwd: vaultPath,
        agentDir: getDefaultPiAgentDir(),
        settingsManager,
        systemPrompt,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await resourceLoader.reload();

      const { session } = await createAgentSession({
        cwd: vaultPath,
        resourceLoader,
        tools: [bashTool],
      });

      this.session = session;
      this.sessionReady = true;
      return true;
    } catch (error) {
      console.error('[PiInstructionRefineService] Failed to create session:', error);
      return false;
    }
  }

  private async sendMessage(prompt: string): Promise<InstructionRefineResult> {
    const systemPrompt = buildRefineSystemPrompt(this.existingInstructions);
    const ready = await this.ensureSession(systemPrompt);
    if (!ready) {
      return { success: false, error: 'Failed to initialize PI session' };
    }

    this.abortController = new AbortController();
    const session = this.session;
    const chunks: string[] = [];
    let resolveChunk: ((chunk: string) => void) | null = null;
    const pending: string[] = [];

    const unsubscribe = session.subscribe((event: PiEvent) => {
      if (event.type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent?.type === 'text_delta' && assistantEvent.delta) {
          if (resolveChunk) {
            resolveChunk(assistantEvent.delta);
            resolveChunk = null;
          } else {
            pending.push(assistantEvent.delta);
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
      this.abortController = null;
      unsubscribe();
    }

    return this.parseResponse(chunks.join(''));
  }

  private parseResponse(responseText: string): InstructionRefineResult {
    const instructionMatch = responseText.match(/<instruction>([\s\S]*?)<\/instruction>/);
    if (instructionMatch) {
      return { success: true, refinedInstruction: instructionMatch[1].trim() };
    }

    const trimmed = responseText.trim();
    if (trimmed) {
      return { success: true, clarification: trimmed };
    }

    return { success: false, error: 'Empty response' };
  }
}
