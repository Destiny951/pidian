import type { ProviderCapabilities, ProviderChatUIConfig } from '../../../core/providers/types';
import { ContextUsageMeter, ExternalContextSelector, McpServerSelector, ModelSelector, PermissionToggle, ServiceTierToggle, ThinkingBudgetSelector } from './toolbar';

export interface ToolbarSettings {
  model: string;
  thinkingBudget: string;
  effortLevel: string;
  serviceTier: string;
  permissionMode: string;
  [key: string]: unknown;
}

export interface ToolbarCallbacks {
  onModelChange: (model: string) => Promise<void>;
  onThinkingBudgetChange: (budget: string) => Promise<void>;
  onEffortLevelChange: (effort: string) => Promise<void>;
  onServiceTierChange: (serviceTier: string) => Promise<void>;
  onPermissionModeChange: (mode: string) => Promise<void>;
  onCompact?: () => Promise<void>;
  getSettings: () => ToolbarSettings;
  getEnvironmentVariables?: () => string;
  getUIConfig: () => ProviderChatUIConfig;
  getCapabilities: () => ProviderCapabilities;
}

export function createInputToolbar(
  parentEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  modelSelector: ModelSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  contextUsageMeter: ContextUsageMeter | null;
  externalContextSelector: ExternalContextSelector;
  mcpServerSelector: McpServerSelector;
  permissionToggle: PermissionToggle;
  serviceTierToggle: ServiceTierToggle;
} {
  const leftGroup = parentEl.createDiv({ cls: 'pidian-toolbar-left-group' });
  
  const modelSelector = new ModelSelector(leftGroup, callbacks);
  const permissionToggle = new PermissionToggle(leftGroup, callbacks);
  const externalContextSelector = new ExternalContextSelector(leftGroup);
  
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const serviceTierToggle = new ServiceTierToggle(parentEl, callbacks);
  const mcpServerSelector = new McpServerSelector(parentEl);
  const contextUsageMeter = new ContextUsageMeter(parentEl);
  contextUsageMeter.setCallbacks(callbacks);

  return {
    modelSelector,
    thinkingBudgetSelector,
    serviceTierToggle,
    contextUsageMeter,
    externalContextSelector,
    mcpServerSelector,
    permissionToggle,
  };
}
