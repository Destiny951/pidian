import type {
  TitleGenerationCallback,
  TitleGenerationService as ServiceInterface,
} from '../../../core/providers/types';
import type PidianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { PiBridgeClient } from '../bridge/PiBridgeClient';

export class PiTitleGenerationService implements ServiceInterface {
  private plugin: PidianPlugin;
  private bridge: PiBridgeClient;

  constructor(plugin: PidianPlugin) {
    this.plugin = plugin;
    this.bridge = new PiBridgeClient(plugin);
  }

  async generateTitle(
    conversationId: string,
    userMessage: string,
    callback: TitleGenerationCallback,
  ): Promise<void> {
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) {
      await callback(conversationId, { success: false, error: 'Could not determine vault path' });
      return;
    }

    const truncatedUser = this.truncateText(userMessage, 500);
    const prompt = [
      'Generate a concise conversation title.',
      'Rules:',
      '- Output title only, no quotes, no punctuation at end.',
      '- Maximum 8 words.',
      '- Language should match the user request.',
      '',
      'User request:',
      truncatedUser,
    ].join('\n');

    const chunks: string[] = [];

    try {
      await this.bridge.ensureReady(vaultPath);
      await this.bridge.prompt(prompt, (event) => {
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          chunks.push(event.assistantMessageEvent.delta ?? '');
        }
      });

      const title = this.parseTitle(chunks.join(''));
      if (title) {
        await callback(conversationId, { success: true, title });
      } else {
        await callback(conversationId, { success: false, error: 'Failed to parse title from response' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await callback(conversationId, { success: false, error: msg });
    }
  }

  cancel(): void {
    void this.bridge.cancel();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  private parseTitle(responseText: string): string | null {
    const normalized = responseText.trim().replace(/\s+/g, ' ');
    if (!normalized) return null;

    const clean = normalized
      .replace(/^['"`]+/, '')
      .replace(/['"`]+$/, '')
      .replace(/[.!?。！？]+$/, '')
      .trim();

    if (!clean) return null;
    if (clean.length > 100) return null;
    return clean;
  }
}
