/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { hookService } from '@process/services/hooks/HookService';

/**
 * Initialize hook IPC bridge handlers
 */
export function initHookBridge(): void {
  // Query handlers
  ipcBridge.hooks.listHooks.provider(async () => {
    return hookService.listHooks();
  });

  ipcBridge.hooks.listHooksByConversation.provider(async ({ conversationId }) => {
    return hookService.listHooksByConversation(conversationId);
  });

  ipcBridge.hooks.getHook.provider(async ({ hookId }) => {
    return hookService.getHook(hookId);
  });

  ipcBridge.hooks.getWebhookPort.provider(async () => {
    return hookService.getWebhookPort();
  });

  // CRUD handlers
  ipcBridge.hooks.addHook.provider(async (params) => {
    const hook = await hookService.addHook(params);
    ipcBridge.hooks.onHookCreated.emit(hook);
    return hook;
  });

  ipcBridge.hooks.updateHook.provider(async ({ hookId, updates }) => {
    const hook = await hookService.updateHook(hookId, updates);
    ipcBridge.hooks.onHookUpdated.emit(hook);
    return hook;
  });

  ipcBridge.hooks.removeHook.provider(async ({ hookId }) => {
    await hookService.removeHook(hookId);
    ipcBridge.hooks.onHookRemoved.emit({ hookId });
  });

  ipcBridge.hooks.restartWebhookServer.provider(async ({ host, port }) => {
    return hookService.restartWebhookServer(host, port);
  });
}
