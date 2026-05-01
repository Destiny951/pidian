import { getDefaultHiddenProviderCommands } from '../../core/providers/commands/hiddenCommands';
import { type PidianSettings } from '../../core/types/settings';
import { DEFAULT_PI_PROVIDER_SETTINGS } from '../../providers/pi/settings';

export const DEFAULT_PIDIAN_SETTINGS: PidianSettings = {
  userName: '',

  permissionMode: 'normal',

  model: 'pi',
  thinkingBudget: 'off',
  effortLevel: 'none',
  serviceTier: 'default',
  enableAutoTitleGeneration: true,
  titleGenerationModel: '',

  excludedTags: [],
  mediaFolder: '',
  systemPrompt: '',
  persistentExternalContextPaths: [],

  sharedEnvironmentVariables: '',
  envSnippets: [],
  customContextLimits: {},

  keyboardNavigation: {
    scrollUpKey: 'w',
    scrollDownKey: 's',
    focusInputKey: 'i',
  },

  locale: 'en',

  providerConfigs: {
    pi: { ...DEFAULT_PI_PROVIDER_SETTINGS },
  },

  settingsProvider: 'pi',
  savedProviderModel: {},
  savedProviderEffort: {},
  savedProviderServiceTier: {},
  savedProviderThinkingBudget: {},

  lastCustomModel: '',

  maxTabs: 3,
  tabBarPosition: 'input',
  enableAutoScroll: true,
  openInMainTab: false,

  hiddenProviderCommands: getDefaultHiddenProviderCommands(),
};
