import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';

export interface PiProviderSettings {
  enabled: boolean;
}

export const DEFAULT_PI_PROVIDER_SETTINGS: Readonly<PiProviderSettings> = Object.freeze({
  enabled: false,
});

export function getPiProviderSettings(
  settings: Record<string, unknown>,
): PiProviderSettings {
  const config = getProviderConfig(settings, 'pi');

  return {
    enabled: (config.enabled as boolean | undefined)
      ?? (settings.piEnabled as boolean | undefined)
      ?? DEFAULT_PI_PROVIDER_SETTINGS.enabled,
  };
}

export function updatePiProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<PiProviderSettings>,
): PiProviderSettings {
  const next = {
    ...getPiProviderSettings(settings),
    ...updates,
  };
  setProviderConfig(settings, 'pi', next);
  return next;
}
