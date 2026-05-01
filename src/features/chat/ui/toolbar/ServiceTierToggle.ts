import { setIcon } from 'obsidian';

import type { ProviderChatUIConfig } from '@/core/providers/types';

export interface ServiceTierSettings {
  serviceTier: string;
  [key: string]: unknown;
}

export interface ServiceTierCallbacks {
  onServiceTierChange: (serviceTier: string) => Promise<void>;
  getSettings: () => ServiceTierSettings;
  getUIConfig: () => ProviderChatUIConfig;
}

export class ServiceTierToggle {
  private container: HTMLElement;
  private buttonEl: HTMLElement | null = null;
  private iconEl: HTMLElement | null = null;
  private callbacks: ServiceTierCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ServiceTierCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'pidian-service-tier-toggle' });
    this.render();
  }

  private render() {
    this.container.empty();

    this.buttonEl = this.container.createDiv({ cls: 'pidian-service-tier-button' });
    this.iconEl = this.buttonEl.createSpan({ cls: 'pidian-service-tier-icon' });
    setIcon(this.iconEl, 'zap');

    this.updateDisplay();

    this.buttonEl.addEventListener('click', () => this.toggle());
  }

  private getToggleConfig(): { activeValue: string; inactiveValue: string } | null {
    const uiConfig = this.callbacks.getUIConfig();
    return uiConfig.getServiceTierToggle?.(this.callbacks.getSettings()) ?? null;
  }

  updateDisplay() {
    if (!this.buttonEl || !this.iconEl) return;

    const toggleConfig = this.getToggleConfig();
    if (!toggleConfig) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = '';
    const current = this.callbacks.getSettings().serviceTier;
    const isActive = current === toggleConfig.activeValue;
    if (isActive) {
      this.buttonEl.addClass('active');
    } else {
      this.buttonEl.removeClass('active');
    }

    this.container.setAttribute('title', 'Toggle on/off fast mode');
  }

  private async toggle() {
    const toggleConfig = this.getToggleConfig();
    if (!toggleConfig) return;

    const current = this.callbacks.getSettings().serviceTier;
    const next = current === toggleConfig.activeValue
      ? toggleConfig.inactiveValue
      : toggleConfig.activeValue;
    await this.callbacks.onServiceTierChange(next);
    this.updateDisplay();
  }
}