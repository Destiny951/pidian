import { PI_PROVIDER_CAPABILITIES } from '@/providers/pi/capabilities';

describe('PI_PROVIDER_CAPABILITIES', () => {
  it('should have pi as providerId', () => {
    expect(PI_PROVIDER_CAPABILITIES.providerId).toBe('pi');
  });

  it('should support persistent runtime', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsPersistentRuntime).toBe(true);
  });

  it('should not support native history', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsNativeHistory).toBe(false);
  });

  it('should not support plan mode', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsPlanMode).toBe(false);
  });

  it('should not support rewind', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsRewind).toBe(false);
  });

  it('should not support fork', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsFork).toBe(false);
  });

  it('should support provider commands', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsProviderCommands).toBe(true);
  });

  it('should not support image attachments', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsImageAttachments).toBe(false);
  });

  it('should support instruction mode', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsInstructionMode).toBe(true);
  });

  it('should not support MCP tools', () => {
    expect(PI_PROVIDER_CAPABILITIES.supportsMcpTools).toBe(false);
  });

  it('should have no reasoning control', () => {
    expect(PI_PROVIDER_CAPABILITIES.reasoningControl).toBe('none');
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(PI_PROVIDER_CAPABILITIES)).toBe(true);
  });
});
