import type { ProviderChatUIConfig, ProviderIconSvg, ProviderUIOption } from '@/core/providers/types';

export interface ModelSelectorSettings {
  model: string;
  [key: string]: unknown;
}

export interface ModelSelectorCallbacks {
  onModelChange: (model: string) => Promise<void>;
  getSettings: () => ModelSelectorSettings;
  getEnvironmentVariables?: () => string;
  getUIConfig: () => ProviderChatUIConfig;
}

export class ModelSelector {
  private container: HTMLElement;
  private buttonEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ModelSelectorCallbacks;
  private models: ProviderUIOption[] | null = null;
  private modelsPromise: Promise<ProviderUIOption[]> | null = null;
  private modelSignature: string | null = null;
  private renderVersion = 0;

  constructor(parentEl: HTMLElement, callbacks: ModelSelectorCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'pidian-model-selector' });
    this.render();
  }

  private async getAvailableModels(force = false): Promise<ProviderUIOption[]> {
    const settings = this.callbacks.getSettings();
    const requestSettings = {
      ...settings,
      environmentVariables: this.callbacks.getEnvironmentVariables?.(),
    };
    const signature = JSON.stringify(requestSettings);
    if (!force && this.models && this.modelSignature === signature) return this.models;
    if (!force && this.modelsPromise && this.modelSignature === signature) return this.modelsPromise;

    const uiConfig = this.callbacks.getUIConfig();
    this.modelSignature = signature;
    this.modelsPromise = Promise.resolve(uiConfig.getModelOptions(requestSettings)).then((models) => {
      this.models = models;
      return models;
    }).finally(() => {
      this.modelsPromise = null;
    });

    return this.modelsPromise;
  }

  private render() {
    this.container.empty();

    this.buttonEl = this.container.createDiv({ cls: 'pidian-model-btn' });
    this.dropdownEl = this.container.createDiv({ cls: 'pidian-model-dropdown' });
    this.buttonEl.createSpan({ text: 'Loading...', cls: 'pidian-model-label' });
    void this.refresh();
  }

  async updateDisplay() {
    await this.refresh();
  }

  async renderOptions() {
    await this.refresh();
  }

  private async refresh(force = false): Promise<void> {
    const version = ++this.renderVersion;
    const models = await this.getAvailableModels(force);
    if (version !== this.renderVersion) return;

    this.renderDisplay(models);
    this.renderDropdown(models);
  }

  private renderDisplay(models: ProviderUIOption[]): void {
    if (!this.buttonEl) return;

    const currentModel = this.callbacks.getSettings().model;
    const displayModel = models.find((model) => model.value === currentModel) ?? models[0];

    this.buttonEl.empty();
    this.buttonEl.createSpan({ text: displayModel?.label || 'Unknown', cls: 'pidian-model-label' });
  }

  private renderDropdown(models: ProviderUIOption[]): void {
    if (!this.dropdownEl) return;

    this.dropdownEl.empty();

    const currentModel = this.callbacks.getSettings().model;
    const reversed = [...models].reverse();

    let lastGroup: string | undefined;
    for (const model of reversed) {
      if (model.group && model.group !== lastGroup) {
        const separator = this.dropdownEl.createDiv({ cls: 'pidian-model-group' });
        separator.setText(model.group);
        lastGroup = model.group;
      }

      const option = this.dropdownEl.createDiv({ cls: 'pidian-model-option' });
      if (model.value === currentModel) {
        option.addClass('selected');
      }

      const icon = model.providerIcon ?? this.callbacks.getUIConfig().getProviderIcon?.();
      if (icon) {
        option.appendChild(createProviderIconSvg(icon));
      }
      option.createSpan({ text: model.label });
      if (model.description) {
        option.setAttribute('title', model.description);
      }

      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onModelChange(model.value);
        await this.refresh();
      });
    }
  }
}

function createProviderIconSvg(icon: ProviderIconSvg): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.classList.add('pidian-model-provider-icon');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', icon.path);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}
