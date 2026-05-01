import type { ProviderCapabilities } from '@/core/providers/types';
import type { UsageInfo } from '@/core/types';

export interface ContextUsageMeterCallbacks {
  onCompact?: () => Promise<void>;
  getCapabilities?: () => ProviderCapabilities;
}

export class ContextUsageMeter {
  private container: HTMLElement;
  private fillPath: SVGPathElement | null = null;
  private circumference: number = 0;
  private currentUsage: UsageInfo | null = null;
  private callbacks: ContextUsageMeterCallbacks | null = null;
  private popupEl: HTMLElement | null = null;
  private isCompacting = false;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'pidian-context-meter' });
    this.render();
    this.container.style.display = 'none';
    this.container.addEventListener('click', () => this.handleClick());
  }

  setCallbacks(callbacks: ContextUsageMeterCallbacks): void {
    this.callbacks = callbacks;
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  setCompacting(compacting: boolean): void {
    this.isCompacting = compacting;
    this.container.toggleClass('pidian-context-meter--compacting', compacting);
    this.updateTooltip();
  }

  private render() {
    const size = 16;
    const strokeWidth = 2;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;

    const startAngle = 150;
    const endAngle = 390;
    const arcDegrees = endAngle - startAngle;
    const arcRadians = (arcDegrees * Math.PI) / 180;
    this.circumference = radius * arcRadians;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const gaugeEl = this.container.createDiv({ cls: 'pidian-context-meter-gauge' });
    gaugeEl.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path class="pidian-meter-bg"
          d="M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}"
          fill="none" stroke-width="${strokeWidth}" stroke-linecap="round"/>
        <path class="pidian-meter-fill"
          d="M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}"
          fill="none" stroke-width="${strokeWidth}" stroke-linecap="round"
          stroke-dasharray="${this.circumference}" stroke-dashoffset="${this.circumference}"/>
      </svg>
    `;
    this.fillPath = gaugeEl.querySelector('.pidian-meter-fill');

    this.container.addClass('pidian-clickable');
  }

  private handleClick(): void {
    if (!this.currentUsage) return;
    this.showPopup();
  }

  private showPopup(): void {
    if (this.popupEl) {
      this.hidePopup();
      return;
    }

    const capabilities = this.callbacks?.getCapabilities?.();
    const supportsCompact = capabilities?.supportsCompact ?? false;

    this.popupEl = document.body.createDiv({ cls: 'pidian-context-popup' });

    const headerEl = this.popupEl.createDiv({ cls: 'pidian-context-popup-header' });
    headerEl.createSpan({ text: 'Context Usage' });

    const closeBtn = headerEl.createSpan({ cls: 'pidian-context-popup-close' });
    closeBtn.setText('×');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hidePopup();
    });

    const contentEl = this.popupEl.createDiv({ cls: 'pidian-context-popup-content' });

    if (this.currentUsage) {
      const tokensEl = contentEl.createDiv({ cls: 'pidian-context-popup-row' });
      tokensEl.createSpan({ cls: 'pidian-context-popup-label', text: 'Context:' });
      tokensEl.createSpan({
        cls: 'pidian-context-popup-value',
        text: `${this.formatTokens(this.currentUsage.contextTokens)} / ${this.formatTokens(this.currentUsage.contextWindow)}`,
      });

      const percentEl = contentEl.createDiv({ cls: 'pidian-context-popup-row' });
      percentEl.createSpan({ cls: 'pidian-context-popup-label', text: 'Usage:' });
      percentEl.createSpan({
        cls: 'pidian-context-popup-value',
        text: this.currentUsage.percentage === null ? 'unknown' : `${this.currentUsage.percentage.toFixed(1)}%`,
      });

      if (this.currentUsage.inputTokens !== undefined) {
        const inputEl = contentEl.createDiv({ cls: 'pidian-context-popup-row' });
        inputEl.createSpan({ cls: 'pidian-context-popup-label', text: 'Input tokens:' });
        inputEl.createSpan({
          cls: 'pidian-context-popup-value',
          text: this.formatTokens(this.currentUsage.inputTokens),
        });
      }
    }

    if (supportsCompact && this.callbacks?.onCompact) {
      const compactEl = contentEl.createDiv({ cls: 'pidian-context-popup-actions' });
      const compactBtn = compactEl.createEl('button', {
        cls: 'pidian-context-popup-compact-btn',
        text: this.isCompacting ? 'Compacting...' : 'Compact context',
      });
      compactBtn.disabled = this.isCompacting;
      compactBtn.addEventListener('click', async (e) => {
        if (this.isCompacting) return;
        e.stopPropagation();
        this.hidePopup();
        if (this.callbacks?.onCompact) {
          await this.callbacks.onCompact();
        }
      });
    }

    const rect = this.container.getBoundingClientRect();
    const wrapperRect = this.container.closest('.pidian-input-wrapper')?.getBoundingClientRect() ?? null;
    this.popupEl.style.position = 'absolute';
    this.popupEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    this.popupEl.style.visibility = 'hidden';
    this.popupEl.style.left = '0px';

    const popupWidth = this.popupEl.offsetWidth;
    const viewportPadding = 8;
    const minLeft = wrapperRect ? wrapperRect.left : viewportPadding;
    const maxLeft = wrapperRect
      ? Math.max(minLeft, wrapperRect.right - popupWidth)
      : Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding);
    const preferredLeft = rect.right - popupWidth;
    const clampedLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    this.popupEl.style.left = `${clampedLeft}px`;
    this.popupEl.style.visibility = 'visible';

    document.addEventListener('click', this.handlePopupClickOutside);
  }

  private handlePopupClickOutside = (e: MouseEvent): void => {
    if (this.popupEl && !this.popupEl.contains(e.target as Node) && !this.container.contains(e.target as Node)) {
      this.hidePopup();
    }
  };

  private hidePopup(): void {
    if (this.popupEl) {
      this.popupEl.remove();
      this.popupEl = null;
      document.removeEventListener('click', this.handlePopupClickOutside);
    }
  }

  update(usage: UsageInfo | null): void {
    this.currentUsage = usage;
    if (!usage || (usage.contextTokens === 0 && usage.percentage === 0)) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = 'flex';
    const fillLength = ((usage.percentage ?? 0) / 100) * this.circumference;
    if (this.fillPath) {
      this.fillPath.style.strokeDashoffset = String(this.circumference - fillLength);
    }

    if ((usage.percentage ?? 0) > 80) {
      this.container.addClass('warning');
    } else {
      this.container.removeClass('warning');
    }

    this.updateTooltip();
  }

  private updateTooltip(): void {
    if (this.isCompacting) {
      const tooltip = 'Compacting context...';
      this.container.setAttribute('data-tooltip', tooltip);
      this.container.setAttribute('aria-label', tooltip);
      return;
    }
    if (!this.currentUsage) {
      this.container.removeAttribute('data-tooltip');
      this.container.removeAttribute('aria-label');
      return;
    }

    let tooltip = `${this.formatTokens(this.currentUsage.contextTokens)} / ${this.formatTokens(this.currentUsage.contextWindow)}`;
    if ((this.currentUsage.percentage ?? 0) > 80) {
      tooltip += ' (Approaching limit, run `/compact` to continue)';
    }
    this.container.setAttribute('data-tooltip', tooltip);
    this.container.setAttribute('aria-label', tooltip);
  }

  private formatTokens(tokens: number | null): string {
    if (tokens === null) {
      return 'unknown';
    }
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return String(tokens);
  }
}
