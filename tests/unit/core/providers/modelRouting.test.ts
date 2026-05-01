import '@/providers';

import { getProviderForModel } from '@/core/providers/modelRouting';

describe('getProviderForModel', () => {
  it('routes the PI model to pi', () => {
    expect(getProviderForModel('pi')).toBe('pi');
  });

  it('falls back to the default provider for unknown models', () => {
    expect(getProviderForModel('some-unknown-model')).toBe('pi');
  });
});
