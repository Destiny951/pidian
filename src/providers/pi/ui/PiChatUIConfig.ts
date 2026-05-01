import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import type PidianPlugin from '../../../main';
import type { PiModelInfo } from '../bridge/protocol';

const PI_ICON: ProviderIconSvg = {
  viewBox: '0 0 24 24',
  path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};

interface PiModelConfig {
  providers: Record<string, {
    models?: Array<{
      id: string;
      name?: string;
      contextWindow?: number;
      reasoning?: boolean;
      input?: string[];
      cost?: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
      };
    }>;
  }>;
}

let cachedModels: ProviderUIOption[] | null = null;
let modelCachePromise: Promise<void> | null = null;
let pluginInstance: PidianPlugin | null = null;
let cachedDefaultModel: string | null = null;

export function setPluginInstance(plugin: PidianPlugin): void {
  pluginInstance = plugin;
}

export function getDefaultModel(): string | null {
  return cachedDefaultModel;
}

export function cachePiModels(models: PiModelInfo[], defaultProvider?: string, defaultModel?: string): void {
  cachedModels = models.map((m) => ({
    value: `${m.provider}/${m.id}`,
    label: m.name,
    description: `${m.provider} - ${m.contextWindow.toLocaleString()} tokens`,
    group: m.provider,
  }));
  
  if (defaultProvider && defaultModel) {
    cachedDefaultModel = `${defaultProvider}/${defaultModel}`;
  }
  
  modelCachePromise = null;
}

export function clearPiModelCache(): void {
  cachedModels = null;
  modelCachePromise = null;
}

async function ensureModelCache(): Promise<void> {
  if (cachedModels !== null || modelCachePromise !== null || !pluginInstance) {
    return;
  }
  
  modelCachePromise = (async () => {
    try {
      // Import dynamically to avoid circular dependency
      const { PiBridgeClient } = await import('../bridge/PiBridgeClient');
      const bridge = new PiBridgeClient(pluginInstance!);
      const { models, defaultProvider, defaultModel } = await bridge.listModels();
      cachePiModels(models, defaultProvider ?? undefined, defaultModel ?? undefined);
      // Dispose the temporary bridge
      bridge.dispose();
    } catch (error) {
      console.error('[PiChatUIConfig] Failed to fetch models:', error);
      modelCachePromise = null;
    }
  })();
  
  await modelCachePromise;
}

function loadPiModelsFromConfig(): ProviderUIOption[] {
  try {
    const agentDir = path.join(os.homedir(), '.pi', 'agent');
    const modelsPath = path.join(agentDir, 'models.json');
    
    if (!fs.existsSync(modelsPath)) {
      return [{ value: 'pi', label: 'PI', description: 'Local PI agent' }];
    }

    const content = fs.readFileSync(modelsPath, 'utf-8');
    const config: PiModelConfig = JSON.parse(content);
    
    const options: ProviderUIOption[] = [];
    
    if (config.providers) {
      for (const [providerName, providerConfig] of Object.entries(config.providers)) {
        if (providerConfig.models && Array.isArray(providerConfig.models)) {
          for (const model of providerConfig.models) {
            options.push({
              value: `${providerName}/${model.id}`,
              label: model.name || model.id,
              description: `${providerName} - ${(model.contextWindow || 0).toLocaleString()} tokens`,
              group: providerName,
            });
          }
        }
      }
    }

    return options.length > 0 ? options : [{ value: 'pi', label: 'PI', description: 'Local PI agent' }];
  } catch {
    return [{ value: 'pi', label: 'PI', description: 'Local PI agent' }];
  }
}

export const piChatUIConfig: ProviderChatUIConfig = {
  async getModelOptions(): Promise<ProviderUIOption[]> {
    if (cachedModels !== null) {
      return cachedModels;
    }
    
    if (modelCachePromise !== null) {
      await modelCachePromise;
      if (cachedModels !== null) {
        return cachedModels;
      }
    }
    
    // Try to fetch models if plugin instance is available
    if (pluginInstance !== null) {
      await ensureModelCache();
      if (cachedModels !== null) {
        return cachedModels;
      }
    }
    
    return loadPiModelsFromConfig();
  },

  ownsModel(model: string): boolean {
    return model === 'pi' || model.includes('/');
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
    const defaultModel = getDefaultModel();
    return defaultModel ? model === defaultModel : model === 'pi';
  },

  applyModelDefaults(model: string, settings: Record<string, unknown>): void {
    // If model is 'pi' or not set, use PI's default model
    if (model === 'pi' || !model) {
      const defaultModel = getDefaultModel();
      if (defaultModel) {
        settings.model = defaultModel;
      }
    }
  },

  normalizeModelVariant(model: string): string {
    return model;
  },

  getCustomModelIds(): Set<string> {
    return new Set();
  },

  getPermissionModeToggle(): { inactiveValue: string; inactiveLabel: string; activeValue: string; activeLabel: string } {
    return {
      inactiveValue: 'normal',
      inactiveLabel: 'Normal',
      activeValue: 'yolo',
      activeLabel: 'Yolo',
    };
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
