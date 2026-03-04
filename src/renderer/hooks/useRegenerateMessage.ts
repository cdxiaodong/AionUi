/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { REGENERATE_PREFIX } from '@/common/constants';
import { useMessageList, useUpdateMessageList } from '@/renderer/messages/hooks';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { useLatestRef } from './useLatestRef';

/**
 * Shared hook for "Regenerate" feature.
 * Listens for the 'conversation.regenerate' emitter event and:
 * 1. Finds the last user message in the message list
 * 2. Deletes AI response messages from DB (after the user message timestamp)
 * 3. Removes them from frontend state
 * 4. Re-sends the last user message with a regeneration hint
 *
 * NOTE: We intentionally do NOT call conversation.stop() here because
 * agent.stop() disconnects the entire connection (AcpAgent.stop → connection.disconnect()),
 * which destroys the session and forces a new connection with fresh context.
 * Instead we just send a new message — the agent will handle it in the existing session.
 */
export function useRegenerateMessage(conversation_id: string, callbacks: { setAiProcessing: (v: boolean) => void }) {
  const messageList = useMessageList();
  const updateMessageList = useUpdateMessageList();
  const messageListRef = useLatestRef(messageList);
  const callbacksRef = useLatestRef(callbacks);

  useAddEventListener(
    'conversation.regenerate',
    () => {
      const list = messageListRef.current;
      if (!list.length) return;

      // Find the last user message (position === 'right', type === 'text')
      let lastUserMsg = null;
      for (let i = list.length - 1; i >= 0; i--) {
        const msg = list[i];
        if (msg.position === 'right' && msg.type === 'text') {
          lastUserMsg = msg;
          break;
        }
      }
      if (!lastUserMsg || !lastUserMsg.createdAt) return;

      // Extract original user content, stripping any existing regeneration prefix
      // to prevent prefix stacking on repeated regenerations
      let userContent = lastUserMsg.type === 'text' ? (lastUserMsg.content as any).content : '';
      if (typeof userContent === 'string') {
        while (userContent.startsWith(REGENERATE_PREFIX)) {
          userContent = userContent.slice(REGENERATE_PREFIX.length);
        }
      }
      if (!userContent) return;

      // All checks passed — proceed with regeneration
      const afterTimestamp = lastUserMsg.createdAt;

      // 1. Delete AI messages after the user message from DB
      ipcBridge.database.deleteMessagesAfter
        .invoke({ conversation_id, after_created_at: afterTimestamp })
        .then(() => {
          // 2. Remove AI messages from frontend state
          updateMessageList((currentList) => {
            return currentList.filter((msg) => !msg.createdAt || msg.createdAt <= afterTimestamp);
          });

          // 3. Set loading state and re-send with regeneration hint for the agent
          // The prefix is hidden from UI display (stripped in MessageText component)
          callbacksRef.current.setAiProcessing(true);

          const msg_id = uuid();
          const regenerateInput = `${REGENERATE_PREFIX}${userContent}`;
          return ipcBridge.conversation.sendMessage.invoke({
            input: regenerateInput,
            msg_id,
            conversation_id,
          });
        })
        .then(() => {
          emitter.emit('chat.history.refresh');
        })
        .catch((e) => {
          console.error('[Regenerate] Failed:', e);
          callbacksRef.current.setAiProcessing(false);
        });
    },
    [conversation_id]
  );
}
