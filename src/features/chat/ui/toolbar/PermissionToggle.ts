import type { ProviderCapabilities,ProviderChatUIConfig } from '@/core/providers/types';

export interface PermissionToggleSettings {
  permissionMode: string;
  [key: string]: unknown;
}

export interface PermissionToggleCallbacks {
  onPermissionModeChange: (mode: string) => Promise<void>;
  getSettings: () => PermissionToggleSettings;
  getUIConfig: () => ProviderChatUIConfig;
  getCapabilities: () => ProviderCapabilities;
}

export class PermissionToggle {
  private container: HTMLElement;
  private toggleEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private callbacks: PermissionToggleCallbacks;

  constructor(parentEl: HTMLElement, callbacks: PermissionToggleCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'pidian-permission-toggle' });
    this.render();
  }

  private render() {
    this.container.empty();

    this.labelEl = this.container.createSpan({ cls: 'pidian-permission-label' });
    this.toggleEl = this.container.createDiv({ cls: 'pidian-toggle-switch' });

    this.updateDisplay();

    this.toggleEl.addEventListener('click', () => this.toggle());
  }

  private getToggleConfig(): { planValue?: string; planLabel?: string; activeValue: string; activeLabel: string; inactiveValue: string; inactiveLabel: string } | null {
    const uiConfig = this.callbacks.getUIConfig();
    return uiConfig.getPermissionModeToggle?.() ?? null;
  }

  updateDisplay() {
    if (!this.toggleEl || !this.labelEl) return;

    const toggleConfig = this.getToggleConfig();
    const capabilities = this.callbacks.getCapabilities();
    if (!toggleConfig) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = '';
    const mode = this.callbacks.getSettings().permissionMode;
    const planValue = toggleConfig.planValue;
    const planLabel = toggleConfig.planLabel ?? 'PLAN';
    const canShowPlan = Boolean(planValue) && capabilities.supportsPlanMode;

    if (canShowPlan && planValue && mode === planValue) {
      this.toggleEl.style.display = 'none';
      this.labelEl.setText(planLabel);
      this.labelEl.addClass('plan-active');
    } else {
      this.toggleEl.style.display = '';
      this.labelEl.removeClass('plan-active');
      if (mode === toggleConfig.activeValue) {
        this.toggleEl.addClass('active');
        this.labelEl.setText(toggleConfig.activeLabel);
      } else {
        this.toggleEl.removeClass('active');
        this.labelEl.setText(toggleConfig.inactiveLabel);
      }
    }
  }

  private async toggle() {
    const toggleConfig = this.getToggleConfig();
    if (!toggleConfig) return;

    const current = this.callbacks.getSettings().permissionMode;
    const newMode = current === toggleConfig.activeValue
      ? toggleConfig.inactiveValue
      : toggleConfig.activeValue;
    await this.callbacks.onPermissionModeChange(newMode);
    this.updateDisplay();
  }
}