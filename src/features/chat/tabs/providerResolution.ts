import type { ProviderId } from '../../../core/providers/types';
import { DEFAULT_CHAT_PROVIDER_ID } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import type PidianPlugin from '../../../main';
import type { TabProviderContext } from './types';

function getStoredConversationProviderId(
  tab: TabProviderContext,
  plugin: PidianPlugin,
): ProviderId {
  if (tab.conversationId) {
    const conversation = plugin.getConversationSync(tab.conversationId);
    if (conversation?.providerId) {
      return conversation.providerId;
    }
  }

  if (tab.lifecycleState === 'blank') {
    return DEFAULT_CHAT_PROVIDER_ID;
  }

  return tab.service?.providerId ?? tab.providerId ?? DEFAULT_CHAT_PROVIDER_ID;
}

export function getTabProviderId(
  tab: TabProviderContext,
  plugin: PidianPlugin,
  conversation?: Conversation | null,
): ProviderId {
  return conversation?.providerId ?? getStoredConversationProviderId(tab, plugin);
}
