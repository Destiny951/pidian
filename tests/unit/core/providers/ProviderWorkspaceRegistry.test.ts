import '@/providers';

import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';

describe('ProviderWorkspaceRegistry', () => {
  afterEach(() => {
    ProviderWorkspaceRegistry.clear();
  });

  it('returns agent mention providers through the workspace registry', () => {
    const piProvider = { searchAgents: jest.fn().mockReturnValue([]) };

    ProviderWorkspaceRegistry.setServices('pi', {
      agentMentionProvider: piProvider as any,
    });

    expect(ProviderWorkspaceRegistry.getAgentMentionProvider('pi')).toBe(piProvider);
  });

  it('refreshes agent mention state through the workspace registry', async () => {
    const refreshPi = jest.fn().mockResolvedValue(undefined);

    ProviderWorkspaceRegistry.setServices('pi', {
      refreshAgentMentions: refreshPi,
    });

    await ProviderWorkspaceRegistry.refreshAgentMentions('pi');

    expect(refreshPi).toHaveBeenCalled();
  });

  it('returns the assigned catalog for a provider', () => {
    const mockCatalog = {
      listDropdownEntries: jest.fn(),
      listVaultEntries: jest.fn(),
      saveVaultEntry: jest.fn(),
      deleteVaultEntry: jest.fn(),
      setRuntimeCommands: jest.fn(),
      getDropdownConfig: jest.fn(),
      refresh: jest.fn(),
    };

    ProviderWorkspaceRegistry.setServices('pi', {
      commandCatalog: mockCatalog as any,
    });

    expect(ProviderWorkspaceRegistry.getCommandCatalog('pi')).toBe(mockCatalog);
  });
});
