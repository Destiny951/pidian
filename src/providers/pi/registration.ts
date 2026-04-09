import type { ProviderRegistration } from '../../core/providers/types';
import type ClaudianPlugin from '../../main';
import { PiInlineEditService } from './aux/PiInlineEditService';
import { PiInstructionRefineService } from './aux/PiInstructionRefineService';
import { piTaskResultInterpreter } from './aux/piTaskResultInterpreter';
import { PiTitleGenerationService } from './aux/PiTitleGenerationService';
import { PI_PROVIDER_CAPABILITIES } from './capabilities';
import { PiConversationHistoryService } from './history/PiConversationHistoryService';
import { PiChatRuntime } from './runtime/PiChatRuntime';
import { getPiProviderSettings } from './settings';
import { piChatUIConfig } from './ui/PiChatUIConfig';

export const piProviderRegistration: ProviderRegistration = {
  displayName: 'PI',
  blankTabOrder: 10,
  isEnabled: (settings) => getPiProviderSettings(settings).enabled,
  capabilities: PI_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^PI_/i, /^MINIMAX_/i, /^UVX_PATH$/i],
  chatUIConfig: piChatUIConfig,
  settingsReconciler: {
    reconcileModelWithEnvironment: () => ({ changed: false, invalidatedConversations: [] }),
    normalizeModelVariantSettings: () => false,
  },
  createRuntime: ({ plugin }) => new PiChatRuntime(plugin),
  createTitleGenerationService: (plugin: ClaudianPlugin) => new PiTitleGenerationService(plugin),
  createInstructionRefineService: (plugin: ClaudianPlugin) => new PiInstructionRefineService(plugin),
  createInlineEditService: (plugin: ClaudianPlugin) => new PiInlineEditService(plugin),
  historyService: new PiConversationHistoryService(),
  taskResultInterpreter: piTaskResultInterpreter,
};
