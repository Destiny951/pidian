import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { piSettingsTabRenderer } from '../ui/PiSettingsTab';

export async function createPiWorkspaceServices(): Promise<ProviderWorkspaceServices> {
  return {
    settingsTabRenderer: piSettingsTabRenderer,
  };
}

export const piWorkspaceRegistration: ProviderWorkspaceRegistration = {
  initialize: async () => createPiWorkspaceServices(),
};
