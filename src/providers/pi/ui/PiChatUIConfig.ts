import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';

const PI_ICON: ProviderIconSvg = {
  viewBox: '0 0 24 24',
  path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};

const PI_MODELS: ProviderUIOption[] = [
  { value: 'pi', label: 'PI', description: 'Local PI agent' },
];

export const piChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(): ProviderUIOption[] {
    return [...PI_MODELS];
  },

  ownsModel(model: string): boolean {
    return model === 'pi';
  },

  isAdaptiveReasoningModel(): boolean {
    return false;
  },

  getReasoningOptions(): ProviderReasoningOption[] {
    return [];
  },

  getDefaultReasoningValue(): string {
    return 'none';
  },

  getContextWindowSize(): number {
    return 0;
  },

  isDefaultModel(model: string): boolean {
    return model === 'pi';
  },

  applyModelDefaults(): void {
    // No-op for PI
  },

  normalizeModelVariant(model: string): string {
    return model;
  },

  getCustomModelIds(): Set<string> {
    return new Set();
  },

  getPermissionModeToggle(): null {
    return null;
  },

  getServiceTierToggle(): null {
    return null;
  },

  isBangBashEnabled(): boolean {
    return false;
  },

  getProviderIcon(): ProviderIconSvg {
    return PI_ICON;
  },
};
