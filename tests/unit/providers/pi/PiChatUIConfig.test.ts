import { piChatUIConfig } from '@/providers/pi/ui/PiChatUIConfig';

describe('PiChatUIConfig', () => {
  describe('getModelOptions', () => {
    it('should return PI model', () => {
      const options = piChatUIConfig.getModelOptions({});
      expect(options).toHaveLength(1);
      expect(options[0].value).toBe('pi');
      expect(options[0].label).toBe('PI');
    });
  });

  describe('ownsModel', () => {
    it('should return true for pi model', () => {
      expect(piChatUIConfig.ownsModel('pi', {})).toBe(true);
    });

    it('should return false for other models', () => {
      expect(piChatUIConfig.ownsModel('claude', {})).toBe(false);
      expect(piChatUIConfig.ownsModel('gpt-5.4', {})).toBe(false);
    });
  });

  describe('isAdaptiveReasoningModel', () => {
    it('should return false', () => {
      expect(piChatUIConfig.isAdaptiveReasoningModel('pi')).toBe(false);
    });
  });

  describe('getReasoningOptions', () => {
    it('should return empty array', () => {
      expect(piChatUIConfig.getReasoningOptions('pi')).toEqual([]);
    });
  });

  describe('getDefaultReasoningValue', () => {
    it('should return none', () => {
      expect(piChatUIConfig.getDefaultReasoningValue('pi')).toBe('none');
    });
  });

  describe('getContextWindowSize', () => {
    it('should return 0', () => {
      expect(piChatUIConfig.getContextWindowSize('pi')).toBe(0);
    });
  });

  describe('isDefaultModel', () => {
    it('should return true for pi', () => {
      expect(piChatUIConfig.isDefaultModel('pi')).toBe(true);
    });
  });

  describe('normalizeModelVariant', () => {
    it('should return model as-is', () => {
      expect(piChatUIConfig.normalizeModelVariant('pi', {})).toBe('pi');
    });
  });

  describe('getCustomModelIds', () => {
    it('should return empty set', () => {
      expect(piChatUIConfig.getCustomModelIds({})).toEqual(new Set());
      expect(piChatUIConfig.getCustomModelIds({ OPENAI_MODEL: 'test' })).toEqual(new Set());
    });
  });

  describe('getPermissionModeToggle', () => {
    it('should return null', () => {
      expect(piChatUIConfig.getPermissionModeToggle?.()).toBeNull();
    });
  });

  describe('getServiceTierToggle', () => {
    it('should return null', () => {
      expect(piChatUIConfig.getServiceTierToggle?.({})).toBeNull();
    });
  });

  describe('isBangBashEnabled', () => {
    it('should return false', () => {
      expect(piChatUIConfig.isBangBashEnabled?.({})).toBe(false);
    });
  });

  describe('getProviderIcon', () => {
    it('should return PI icon', () => {
      const icon = piChatUIConfig.getProviderIcon?.();
      expect(icon).toBeDefined();
      expect(icon?.viewBox).toBe('0 0 24 24');
      expect(icon?.path).toContain('M12');
    });
  });
});
