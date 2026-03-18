/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { stripThinkTags } from '@process/task/ThinkTagDetector';

const MAX_NOTIFICATION_BODY_LENGTH = 180;

export const normalizeTaskNotificationBody = (body: string | undefined | null, fallback: string): string => {
  const normalized = stripThinkTags(body || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= MAX_NOTIFICATION_BODY_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1).trimEnd()}…`;
};
