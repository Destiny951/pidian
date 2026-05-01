import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import type PidianPlugin from '../../../main';
import { getVaultPath } from '../../../utils/path';
import { PiBridgeClient } from '../bridge/PiBridgeClient';
import { PiCommandCatalog } from './PiCommandCatalog';

export async function createPiWorkspaceServices(
  plugin: PidianPlugin,
): Promise<ProviderWorkspaceServices> {
  const vaultPath = getVaultPath(plugin.app) ?? process.cwd();
  const bridge = new PiBridgeClient(plugin);
  const commandCatalog = new PiCommandCatalog(bridge, vaultPath);

  return {
    commandCatalog,
  };
}

export const piWorkspaceRegistration: ProviderWorkspaceRegistration = {
  initialize: async ({ plugin }) => createPiWorkspaceServices(plugin),
};
