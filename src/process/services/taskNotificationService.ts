/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { getDatabase } from '@process/database';
import i18n from '@process/i18n';
import { showNotification, shouldNotifyForBackgroundTaskCompletion } from '@process/bridge/notificationBridge';
import { normalizeTaskNotificationBody } from './taskNotificationUtils';

const extractAssistantText = (message: TMessage): string => {
  if (message.type !== 'text' || message.position !== 'left') {
    return '';
  }

  return message.content.content || '';
};

const getLatestAssistantMessagePreview = (conversationId: string, startedAt?: number): string => {
  try {
    const db = getDatabase();
    const result = db.getConversationMessages(conversationId, 0, 50, 'DESC');
    const latestAssistantMessage = (result.data || []).find(
      (message) => extractAssistantText(message).trim().length > 0 && (message.createdAt || 0) >= (startedAt || 0)
    );
    return latestAssistantMessage ? extractAssistantText(latestAssistantMessage) : '';
  } catch (error) {
    console.warn('[TaskNotificationService] Failed to read latest assistant message:', error);
    return '';
  }
};

const getConversationTitle = (conversationId: string): string => {
  try {
    const db = getDatabase();
    const result = db.getConversation(conversationId);
    if (result.success && result.data?.name?.trim()) {
      return result.data.name.trim();
    }
  } catch (error) {
    console.warn('[TaskNotificationService] Failed to read conversation title:', error);
  }

  return i18n.t('cron.notification.taskComplete');
};

export async function notifyConversationTaskCompletion({
  conversationId,
  previewText,
  startedAt,
}: {
  conversationId: string;
  previewText?: string;
  startedAt?: number;
}): Promise<void> {
  if (!shouldNotifyForBackgroundTaskCompletion()) {
    return;
  }

  const title = getConversationTitle(conversationId);
  const body = normalizeTaskNotificationBody(
    previewText || getLatestAssistantMessagePreview(conversationId, startedAt),
    i18n.t('cron.notification.taskDone')
  );

  await showNotification({
    title,
    body,
    conversationId,
  });
}
