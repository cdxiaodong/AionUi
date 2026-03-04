/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from './bridge';
import { cronService } from '@process/services/cron/CronService';
import { hookService } from '@process/services/hooks/HookService';
import { ConfigStorage } from '@/common/storage';

logger.config({ print: true });

// 初始化所有IPC桥接
initAllBridges();

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  console.error('[initBridge] Failed to initialize CronService:', error);
});

// Initialize hook service (load hooks from database and start webhook server)
void (async () => {
  try {
    const webhookConfig = await ConfigStorage.get('webhook.config');
    await hookService.init(webhookConfig?.host, webhookConfig?.port);
  } catch (error) {
    console.error('[initBridge] Failed to initialize HookService:', error);
  }
})();
