import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { getPiProviderSettings, updatePiProviderSettings } from '../settings';

const PI_ENV_SCOPE = 'provider:pi' as const;
const PI_ENV_FIELDS = [
  {
    key: 'PI_AGENT_DIR',
    name: 'PI_AGENT_DIR',
    desc: 'PI agent directory. Default is ~/.pi/agent when empty.',
    placeholder: '/Users/you/.pi/agent',
  },
  {
    key: 'PI_SDK_PATH',
    name: 'PI_SDK_PATH',
    desc: 'Optional explicit PI SDK entry path.',
    placeholder: '/path/to/pi-coding-agent/dist/index.js',
  },
  {
    key: 'MINIMAX_CN_API_KEY',
    name: 'MINIMAX_CN_API_KEY',
    desc: 'MiniMax API key consumed by minimax-mcp extension.',
    placeholder: 'your-key',
  },
  {
    key: 'MINIMAX_API_HOST',
    name: 'MINIMAX_API_HOST',
    desc: 'MiniMax API host. Example: https://api.minimaxi.com',
    placeholder: 'https://api.minimaxi.com',
  },
  {
    key: 'UVX_PATH',
    name: 'UVX_PATH',
    desc: 'uvx executable path if not discoverable from PATH.',
    placeholder: 'uvx',
  },
] as const;

const PI_ENV_KEY_SET = new Set<string>(PI_ENV_FIELDS.map((field) => field.key));

function toEnvText(entries: Record<string, string>): string {
  return Object.entries(entries)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export const piSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const piSettings = getPiProviderSettings(settingsBag);

    const persistedEnv = parseEnvironmentVariables(
      context.plugin.getEnvironmentVariablesForScope(PI_ENV_SCOPE),
    );

    const envState: Record<string, string> = Object.fromEntries(
      PI_ENV_FIELDS.map((field) => [field.key, persistedEnv[field.key] ?? '']),
    );

    const extraState: Record<string, string> = Object.fromEntries(
      Object.entries(persistedEnv).filter(([key]) => !PI_ENV_KEY_SET.has(key)),
    );

    const saveEnvironment = async (): Promise<void> => {
      const combined = {
        ...extraState,
        ...envState,
      };
      await context.plugin.applyEnvironmentVariables(PI_ENV_SCOPE, toEnvText(combined));
    };

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSaveEnvironment = (): void => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        void saveEnvironment();
      }, 300);
    };

    new Setting(container)
      .setName('Enable PI provider')
      .setDesc('When enabled, PI appears in the model selector for new conversations.')
      .addToggle((toggle) =>
        toggle
          .setValue(piSettings.enabled)
          .onChange(async (value) => {
            updatePiProviderSettings(settingsBag, { enabled: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    new Setting(container).setName('Environment').setHeading();

    for (const field of PI_ENV_FIELDS) {
      const envSetting = new Setting(container)
        .setName(field.name)
        .setDesc(field.desc);

      let apiKeyInput: HTMLInputElement | null = null;

      envSetting.addText((text) => {
          text
            .setPlaceholder(field.placeholder)
            .setValue(envState[field.key])
            .onChange((value) => {
              envState[field.key] = value.trim();
              scheduleSaveEnvironment();
            });

          if (field.key === 'MINIMAX_CN_API_KEY') {
            text.inputEl.type = 'password';
            apiKeyInput = text.inputEl;
          }

          text.inputEl.addEventListener('blur', () => {
            void saveEnvironment();
          });
        });

      if (field.key === 'MINIMAX_CN_API_KEY') {
        envSetting.addButton((button) => {
          button
            .setButtonText('Show')
            .onClick(() => {
              if (!apiKeyInput) {
                return;
              }

              const nextType = apiKeyInput.type === 'password' ? 'text' : 'password';
              apiKeyInput.type = nextType;
              button.setButtonText(nextType === 'password' ? 'Show' : 'Hide');
            });
        });
      }
    }

    new Setting(container)
      .setName('Additional PI env (optional)')
      .setDesc('One KEY=VALUE per line. Keep this for non-standard variables.')
      .addTextArea((text) => {
        text
          .setPlaceholder('CUSTOM_KEY=value')
          .setValue(toEnvText(extraState))
          .onChange((value) => {
            const parsed = parseEnvironmentVariables(value);
            for (const key of Object.keys(extraState)) {
              delete extraState[key];
            }
            for (const [key, envValue] of Object.entries(parsed)) {
              if (!PI_ENV_KEY_SET.has(key)) {
                extraState[key] = envValue;
              }
            }
            scheduleSaveEnvironment();
          });

        text.inputEl.rows = 4;
        text.inputEl.addEventListener('blur', () => {
          void saveEnvironment();
        });
      });
  },
};
