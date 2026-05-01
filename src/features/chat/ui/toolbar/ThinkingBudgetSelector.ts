import type { ProviderChatUIConfig, ProviderReasoningOption } from '@/core/providers/types';

export interface ThinkingBudgetSettings {
  thinkingBudget: string;
  effortLevel: string;
  model: string;
  [key: string]: unknown;
}

export interface ThinkingBudgetCallbacks {
  onThinkingBudgetChange: (budget: string) => Promise<void>;
  onEffortLevelChange: (effort: string) => Promise<void>;
  getSettings: () => ThinkingBudgetSettings;
  getUIConfig: () => ProviderChatUIConfig;
  getCapabilities: () => { reasoningControl: 'none' | 'effort' | 'token-budget' };
}

export class ThinkingBudgetSelector {
  private container: HTMLElement;
  private effortEl: HTMLElement | null = null;
  private effortGearsEl: HTMLElement | null = null;
  private budgetEl: HTMLElement | null = null;
  private budgetGearsEl: HTMLElement | null = null;
  private callbacks: ThinkingBudgetCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ThinkingBudgetCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'pidian-thinking-selector' });
    this.render();
  }

  private render() {
    this.container.empty();

    this.effortEl = this.container.createDiv({ cls: 'pidian-thinking-effort' });
    const effortLabel = this.effortEl.createSpan({ cls: 'pidian-thinking-label-text' });
    effortLabel.setText('Effort:');
    this.effortGearsEl = this.effortEl.createDiv({ cls: 'pidian-thinking-gears' });

    this.budgetEl = this.container.createDiv({ cls: 'pidian-thinking-budget' });
    const budgetLabel = this.budgetEl.createSpan({ cls: 'pidian-thinking-label-text' });
    budgetLabel.setText('Thinking:');
    this.budgetGearsEl = this.budgetEl.createDiv({ cls: 'pidian-thinking-gears' });

    this.updateDisplay();
  }

  private renderEffortGears() {
    if (!this.effortGearsEl) return;
    this.effortGearsEl.empty();

    const currentEffort = this.callbacks.getSettings().effortLevel;
    const uiConfig = this.callbacks.getUIConfig();
    const model = this.callbacks.getSettings().model;
    const options = uiConfig.getReasoningOptions(model);
    const currentInfo = options.find(e => e.value === currentEffort);

    const currentEl = this.effortGearsEl.createDiv({ cls: 'pidian-thinking-current' });
    currentEl.setText(currentInfo?.label || 'High');

    const optionsEl = this.effortGearsEl.createDiv({ cls: 'pidian-thinking-options' });

    for (const effort of [...options].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'pidian-thinking-gear' });
      gearEl.setText(effort.label);

      if (effort.value === currentEffort) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onEffortLevelChange(effort.value);
        this.updateDisplay();
      });
    }
  }

  private renderBudgetGears() {
    if (!this.budgetGearsEl) return;
    this.budgetGearsEl.empty();

    const currentBudget = this.callbacks.getSettings().thinkingBudget;
    const uiConfig = this.callbacks.getUIConfig();
    const model = this.callbacks.getSettings().model;
    const options: ProviderReasoningOption[] = uiConfig.getReasoningOptions(model);
    const currentBudgetInfo = options.find(b => b.value === currentBudget);

    const currentEl = this.budgetGearsEl.createDiv({ cls: 'pidian-thinking-current' });
    currentEl.setText(currentBudgetInfo?.label || 'Off');

    const optionsEl = this.budgetGearsEl.createDiv({ cls: 'pidian-thinking-options' });

    for (const budget of [...options].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'pidian-thinking-gear' });
      gearEl.setText(budget.label);
      const tokens = budget.tokens ?? 0;
      gearEl.setAttribute('title', tokens > 0 ? `${tokens.toLocaleString()} tokens` : 'Disabled');

      if (budget.value === currentBudget) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.callbacks.onThinkingBudgetChange(budget.value);
        this.updateDisplay();
      });
    }
  }

  updateDisplay() {
    const capabilities = this.callbacks.getCapabilities();
    if (capabilities.reasoningControl === 'none') {
      if (this.effortEl) this.effortEl.style.display = 'none';
      if (this.budgetEl) this.budgetEl.style.display = 'none';
      return;
    }

    const model = this.callbacks.getSettings().model;
    const uiConfig = this.callbacks.getUIConfig();
    const adaptive = uiConfig.isAdaptiveReasoningModel(model);

    if (this.effortEl) {
      this.effortEl.style.display = adaptive ? '' : 'none';
    }
    if (this.budgetEl) {
      this.budgetEl.style.display = adaptive ? 'none' : '';
    }

    if (adaptive) {
      this.renderEffortGears();
    } else {
      this.renderBudgetGears();
    }
  }
}