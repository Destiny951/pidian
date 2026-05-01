import type { ProviderCommandCatalog,ProviderCommandDropdownConfig } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { PiBridgeClient } from '../bridge/PiBridgeClient';
import type { PiSkillInfo } from '../bridge/protocol';

export class PiCommandCatalog implements ProviderCommandCatalog {
  private bridge: PiBridgeClient;
  private cwd: string;
  private cachedCommands: PiSkillInfo[] = [];

  constructor(bridge: PiBridgeClient, cwd: string) {
    this.bridge = bridge;
    this.cwd = cwd;
  }

  async listDropdownEntries(context: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    void context;
    const commands = await this.fetchCommands();
    return commands.map((cmd) => this.commandToEntry(cmd));
  }

  async listVaultEntries(): Promise<ProviderCommandEntry[]> {
    const commands = await this.fetchCommands();
    return commands.map((cmd) => this.commandToEntry(cmd));
  }

  async saveVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('PI commands are read-only and cannot be saved');
  }

  async deleteVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('PI commands are read-only and cannot be deleted');
  }

  setRuntimeCommands(_commands: unknown[]): void {
    // PI commands come from the bridge, not from runtime commands
  }

  getDropdownConfig(): ProviderCommandDropdownConfig {
    return {
      providerId: 'pi',
      triggerChars: ['/'],
      builtInPrefix: '/',
      skillPrefix: '/skill:',
      commandPrefix: '/',
    };
  }

  async refresh(): Promise<void> {
    this.cachedCommands = [];
  }

  private async fetchCommands(): Promise<PiSkillInfo[]> {
    if (this.cachedCommands.length > 0) {
      return this.cachedCommands;
    }
    try {
      this.cachedCommands = await this.bridge.discoverSkills(this.cwd);
    } catch (error) {
      console.error('[PiCommandCatalog] Failed to fetch commands:', error);
      return [];
    }
    return this.cachedCommands;
  }

  private commandToEntry(item: PiSkillInfo): ProviderCommandEntry {
    const kind = item.source === 'prompt' ? 'prompt' : 'skill';
    const prefix = item.source === 'skill' ? 'skill:' : item.source === 'prompt' ? 'prompt:' : '';
    const displayName = prefix ? `${prefix}${item.name}` : item.name;
    
    return {
      id: `pi-${item.source}:${item.name}`,
      providerId: 'pi',
      kind,
      name: displayName,
      description: item.description,
      content: `/${displayName}`,
      disableModelInvocation: false,
      userInvocable: true,
      scope: 'system',
      source: 'sdk',
      isEditable: false,
      isDeletable: false,
      displayPrefix: '/',
      insertPrefix: '/',
    };
  }
}
