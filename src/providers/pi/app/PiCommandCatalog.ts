import type { ProviderCommandDropdownConfig, ProviderCommandCatalog } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { PiBridgeClient } from '../bridge/PiBridgeClient';
import type { PiSkillInfo } from '../bridge/protocol';

export class PiCommandCatalog implements ProviderCommandCatalog {
  private bridge: PiBridgeClient;
  private cwd: string;
  private cachedSkills: PiSkillInfo[] = [];

  constructor(bridge: PiBridgeClient, cwd: string) {
    this.bridge = bridge;
    this.cwd = cwd;
  }

  async listDropdownEntries(context: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    void context;
    const skills = await this.fetchSkills();
    return skills.map((skill) => this.skillToEntry(skill));
  }

  async listVaultEntries(): Promise<ProviderCommandEntry[]> {
    const skills = await this.fetchSkills();
    return skills.map((skill) => this.skillToEntry(skill));
  }

  async saveVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('PI skills are read-only and cannot be saved');
  }

  async deleteVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('PI skills are read-only and cannot be deleted');
  }

  setRuntimeCommands(_commands: unknown[]): void {
    // PI skills come from the bridge, not from runtime commands
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
    this.cachedSkills = [];
  }

  private async fetchSkills(): Promise<PiSkillInfo[]> {
    if (this.cachedSkills.length > 0) {
      return this.cachedSkills;
    }
    try {
      this.cachedSkills = await this.bridge.discoverSkills(this.cwd);
    } catch (error) {
      console.error('[PiCommandCatalog] Failed to fetch skills:', error);
      return [];
    }
    return this.cachedSkills;
  }

  private skillToEntry(skill: PiSkillInfo): ProviderCommandEntry {
    return {
      id: `pi-skill:${skill.name}`,
      providerId: 'pi',
      kind: 'skill',
      name: skill.name,
      description: skill.description,
      content: `/skill:${skill.name}`,
      disableModelInvocation: false,
      userInvocable: true,
      scope: 'system',
      source: 'sdk',
      isEditable: false,
      isDeletable: false,
      displayPrefix: '/skill:',
      insertPrefix: '/skill:',
    };
  }
}
