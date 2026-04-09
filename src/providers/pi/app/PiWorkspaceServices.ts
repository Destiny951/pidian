import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type ClaudianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { PiCommandCatalog } from './PiCommandCatalog';
import { PiBridgeClient } from '../bridge/PiBridgeClient';
import { piSettingsTabRenderer } from '../ui/PiSettingsTab';

export async function createPiWorkspaceServices(
  plugin: ClaudianPlugin,
): Promise<ProviderWorkspaceServices> {
  const vaultPath = getVaultPath(plugin.app) ?? process.cwd();
  const bridge = new PiBridgeClient(plugin);
  const commandCatalog = new PiCommandCatalog(bridge, vaultPath);

  return {
    settingsTabRenderer: piSettingsTabRenderer,
    commandCatalog,
  };
}

export const piWorkspaceRegistration: ProviderWorkspaceRegistration = {
  initialize: async ({ plugin }) => createPiWorkspaceServices(plugin),
};
