import { DEFAULT_CHAT_PROVIDER_ID, type ProviderId } from './types';

export function getProviderForModel(_model: string, _settings?: Record<string, unknown>): ProviderId {
  return DEFAULT_CHAT_PROVIDER_ID;
}
