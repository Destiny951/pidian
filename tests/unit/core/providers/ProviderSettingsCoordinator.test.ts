import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { Conversation } from '@/core/types';

describe('ProviderSettingsCoordinator', () => {
  describe('normalizeProviderSelection', () => {
    it('falls back to pi for unknown providers', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mystery-provider',
      };

      const changed = ProviderSettingsCoordinator.normalizeProviderSelection(settings);

      expect(changed).toBe(true);
      expect(settings.settingsProvider).toBe('pi');
    });

    it('returns false when already normalized (no-op)', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'pi',
      };
      expect(ProviderSettingsCoordinator.normalizeProviderSelection(settings)).toBe(false);
    });
  });

  describe('reconcileAllProviders', () => {
    it('delegates to each registered provider reconciler with its own conversations', async () => {
      const settings: Record<string, unknown> = { model: 'pi' };
      const piConv = { providerId: 'pi', messages: [] } as unknown as Conversation;
      const conversations = [piConv];

      const result = await ProviderSettingsCoordinator.reconcileAllProviders(settings, conversations);

      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('invalidatedConversations');
      expect(Array.isArray(result.invalidatedConversations)).toBe(true);
    });

    it('filters conversations per provider', async () => {
      const reconcileSpy = jest.spyOn(
        ProviderRegistry.getSettingsReconciler('pi'),
        'reconcileModelWithEnvironment',
      );

      const piConv = { providerId: 'pi', messages: [] } as unknown as Conversation;
      const otherConv = { providerId: 'other', messages: [] } as unknown as Conversation;
      const settings: Record<string, unknown> = { model: 'pi' };

      await ProviderSettingsCoordinator.reconcileAllProviders(settings, [piConv, otherConv]);

      expect(reconcileSpy).toHaveBeenCalledWith(
        settings,
        [piConv],
      );

      reconcileSpy.mockRestore();
    });
  });

  describe('normalizeAllModelVariants', () => {
    it('delegates to registered providers', async () => {
      const settings: Record<string, unknown> = { model: 'pi' };
      const result = await ProviderSettingsCoordinator.normalizeAllModelVariants(settings);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('projectActiveProviderState', () => {
    it('projects saved model for the settings provider', async () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'pi',
        model: 'old-model',
        effortLevel: 'low',
        serviceTier: 'default',
        thinkingBudget: '500',
        savedProviderModel: {},
        savedProviderEffort: { pi: 'none' },
        savedProviderThinkingBudget: { pi: 'none' },
      };

      await ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(typeof settings.model).toBe('string');
      expect(settings.effortLevel).toBe('none');
      expect(settings.thinkingBudget).toBe('none');
    });

    it('defaults to available model when settingsProvider is not set', async () => {
      const settings: Record<string, unknown> = {
        model: 'old-model',
        effortLevel: 'low',
        serviceTier: 'default',
        thinkingBudget: '500',
        savedProviderModel: {},
        savedProviderEffort: { pi: 'none' },
        savedProviderThinkingBudget: { pi: 'none' },
      };

      await ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(typeof settings.model).toBe('string');
      expect(settings.effortLevel).toBe('none');
      expect(settings.serviceTier).toBe('default');
      expect(settings.thinkingBudget).toBe('none');
    });

    it('does not overwrite when no saved values exist', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'pi',
        model: 'pi',
        effortLevel: 'none',
        serviceTier: 'default',
        thinkingBudget: 'none',
        savedProviderModel: {},
        savedProviderEffort: {},
        savedProviderServiceTier: {},
        savedProviderThinkingBudget: {},
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('pi');
      expect(settings.effortLevel).toBe('none');
      expect(settings.thinkingBudget).toBe('none');
    });

    it('handles missing saved maps gracefully', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'pi',
        model: 'pi',
        effortLevel: 'none',
        serviceTier: 'default',
        thinkingBudget: 'none',
      };

      // Should not throw
      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe('pi');
    });
  });

  describe('persistProjectedProviderState', () => {
    it('stores the current top-level projection for the settings provider', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'pi',
        model: 'pi',
        effortLevel: 'none',
        serviceTier: 'default',
        thinkingBudget: 'none',
      };

      ProviderSettingsCoordinator.persistProjectedProviderState(settings);

      expect(settings.savedProviderModel).toEqual({ pi: 'pi' });
      expect(settings.savedProviderEffort).toEqual({ pi: 'none' });
      expect(settings.savedProviderThinkingBudget).toEqual({ pi: 'none' });
    });
  });
});
