import { setProviderConfig } from '../../core/providers/providerConfig';

export type PiProviderSettings = Record<never, never>;

export const DEFAULT_PI_PROVIDER_SETTINGS: Readonly<PiProviderSettings> = Object.freeze({});

export function getPiProviderSettings(
  _settings: Record<string, unknown>,
): PiProviderSettings {
  return { ...DEFAULT_PI_PROVIDER_SETTINGS };
}

export function updatePiProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<PiProviderSettings>,
): PiProviderSettings {
  const next = {
    ...DEFAULT_PI_PROVIDER_SETTINGS,
    ...updates,
  };
  setProviderConfig(settings, 'pi', next);
  return next;
}
