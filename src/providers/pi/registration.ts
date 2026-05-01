import type { ProviderRegistration } from '../../core/providers/types';
import type PidianPlugin from '../../main';
import { PiInlineEditService } from './aux/PiInlineEditService';
import { PiInstructionRefineService } from './aux/PiInstructionRefineService';
import { piTaskResultInterpreter } from './aux/piTaskResultInterpreter';
import { PiTitleGenerationService } from './aux/PiTitleGenerationService';
import { PI_PROVIDER_CAPABILITIES } from './capabilities';
import { PiConversationHistoryService } from './history/PiConversationHistoryService';
import { PiChatRuntime } from './runtime/PiChatRuntime';
import { piChatUIConfig } from './ui/PiChatUIConfig';

export const piProviderRegistration: ProviderRegistration = {
  displayName: 'PI',
  blankTabOrder: 10,
  isEnabled: () => true,
  capabilities: PI_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^PI_/i],
  chatUIConfig: piChatUIConfig,
  settingsReconciler: {
    reconcileModelWithEnvironment: () => ({ changed: false, invalidatedConversations: [] }),
    normalizeModelVariantSettings: () => false,
  },
  createRuntime: ({ plugin }) => new PiChatRuntime(plugin),
  createTitleGenerationService: (plugin: PidianPlugin) => new PiTitleGenerationService(plugin),
  createInstructionRefineService: (plugin: PidianPlugin) => new PiInstructionRefineService(plugin),
  createInlineEditService: (plugin: PidianPlugin) => new PiInlineEditService(plugin),
  historyService: new PiConversationHistoryService(),
  taskResultInterpreter: piTaskResultInterpreter,
};
