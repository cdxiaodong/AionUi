/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import type { CronMessageMeta } from '@/common/chatLib';
import { getDatabase } from '@process/database';
import { cronBusyGuard } from '../cron/CronBusyGuard';
import WorkerManage from '../../WorkerManage';
import { copyFilesToDirectory } from '../../utils';
import { hookStore, type HookJob, type HookKind, type HookConfig } from './HookStore';
import { webhookHandler } from './WebhookHandler';
import { rssHandler } from './RssHandler';
import { fileHandler } from './FileHandler';
import type { AcpBackendAll } from '@/types/acpTypes';

/**
 * Parameters for creating a new hook
 */
export interface CreateHookParams {
  name: string;
  kind: HookKind;
  config: HookConfig;
  message: string;
  conversationId: string;
  conversationTitle?: string;
  agentType: AcpBackendAll;
  createdBy: 'user' | 'agent';
}

/**
 * HookService - Core engine for event-driven agent triggers
 *
 * Manages three types of hooks:
 * - Webhook: HTTP POST triggers
 * - RSS: Feed polling triggers
 * - File: File system change triggers
 *
 * Unlike cron (one per conversation), multiple hooks can be
 * attached to a single conversation.
 */
class HookService {
  private initialized = false;

  /**
   * Initialize the hook service
   * Load all enabled hooks from database and start them
   */
  async init(webhookHost?: string, webhookPort?: number): Promise<void> {
    if (this.initialized) return;

    try {
      // Set up trigger functions for all handlers
      const triggerFn = this.triggerHook.bind(this);
      webhookHandler.setTriggerFn(triggerFn);
      rssHandler.setTriggerFn(triggerFn);
      fileHandler.setTriggerFn(triggerFn);

      // Start the standalone webhook server
      await webhookHandler.startServer(webhookPort, webhookHost);

      // Load and start all enabled hooks
      const hooks = hookStore.listEnabled();
      for (const hook of hooks) {
        this.startHook(hook);
      }

      this.initialized = true;
      console.log(`[HookService] Initialized with ${hooks.length} enabled hook(s)`);
    } catch (error) {
      console.error('[HookService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get the webhook server port (for frontend URL generation)
   */
  getWebhookPort(): number {
    return webhookHandler.port;
  }

  /**
   * Add a new hook (no per-conversation limit, unlike cron)
   */
  async addHook(params: CreateHookParams): Promise<HookJob> {
    const now = Date.now();
    const hookId = `hook_${uuid()}`;

    const hook: HookJob = {
      id: hookId,
      name: params.name,
      kind: params.kind,
      enabled: true,
      config: params.config,
      message: params.message,
      metadata: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        agentType: params.agentType,
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
      },
      state: {
        triggerCount: 0,
      },
    };

    // Save to database
    hookStore.insert(hook);

    // Update conversation modifyTime
    try {
      const db = getDatabase();
      db.updateConversation(params.conversationId, { modifyTime: now });
    } catch (err) {
      console.warn('[HookService] Failed to update conversation modifyTime:', err);
    }

    // Start the hook
    if (hook.enabled) {
      this.startHook(hook);
    }

    return hook;
  }

  /**
   * Update an existing hook
   */
  async updateHook(hookId: string, updates: Partial<HookJob>): Promise<HookJob> {
    const existing = hookStore.getById(hookId);
    if (!existing) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    // Stop existing hook
    this.stopHook(existing.id, existing.kind);

    // Update in database
    hookStore.update(hookId, updates);

    // Get updated hook
    const updated = hookStore.getById(hookId)!;

    // Restart if enabled
    if (updated.enabled) {
      this.startHook(updated);
    }

    return updated;
  }

  /**
   * Remove a hook
   */
  async removeHook(hookId: string): Promise<void> {
    const existing = hookStore.getById(hookId);
    if (existing) {
      this.stopHook(existing.id, existing.kind);
    }
    hookStore.delete(hookId);
  }

  /**
   * List all hooks
   */
  async listHooks(): Promise<HookJob[]> {
    return hookStore.listAll();
  }

  /**
   * List hooks by conversation
   */
  async listHooksByConversation(conversationId: string): Promise<HookJob[]> {
    return hookStore.listByConversation(conversationId);
  }

  /**
   * Get a specific hook
   */
  async getHook(hookId: string): Promise<HookJob | null> {
    return hookStore.getById(hookId);
  }

  /**
   * Start a hook based on its kind
   */
  private startHook(hook: HookJob): void {
    switch (hook.config.kind) {
      case 'webhook':
        webhookHandler.register(hook);
        break;
      case 'rss':
        rssHandler.startPolling(hook);
        break;
      case 'file':
        fileHandler.startWatching(hook);
        break;
    }
  }

  /**
   * Stop a hook based on its kind
   */
  private stopHook(hookId: string, kind: HookKind): void {
    switch (kind) {
      case 'webhook':
        webhookHandler.unregister(hookId);
        break;
      case 'rss':
        rssHandler.stopPolling(hookId);
        break;
      case 'file':
        fileHandler.stopWatching(hookId);
        break;
    }
  }

  /**
   * Trigger hook execution - send message to conversation
   * Follows the same pattern as CronService.executeJob
   */
  async triggerHook(hook: HookJob, eventPayload: string): Promise<void> {
    const { conversationId } = hook.metadata;

    // Check if conversation is busy
    const isBusy = cronBusyGuard.isProcessing(conversationId);
    if (isBusy) {
      console.log(`[HookService] Conversation ${conversationId} busy, skipping hook ${hook.id}`);
      hook.state.lastStatus = 'skipped';
      hook.state.lastError = 'Conversation busy';
      hook.state.lastTriggeredAt = Date.now();
      hookStore.update(hook.id, { state: hook.state });
      const updatedHook = hookStore.getById(hook.id);
      if (updatedHook) {
        ipcBridge.hooks.onHookTriggered.emit({ hookId: hook.id, status: 'skipped', error: 'Conversation busy' });
        ipcBridge.hooks.onHookUpdated.emit(updatedHook);
      }
      return;
    }

    // Update state before execution
    hook.state.lastTriggeredAt = Date.now();
    hook.state.triggerCount++;

    try {
      // Replace {{payload}} in message template
      const messageText = hook.message.replace(/\{\{payload\}\}/g, eventPayload);
      const msgId = uuid();

      // Get or build task (yoloMode=true for auto-approve)
      let task;
      try {
        const existingTask = WorkerManage.getTaskById(conversationId);
        if (existingTask) {
          const yoloEnabled = await existingTask.ensureYoloMode();
          if (yoloEnabled) {
            task = existingTask;
          } else {
            WorkerManage.kill(conversationId);
            task = await WorkerManage.getTaskByIdRollbackBuild(conversationId, {
              yoloMode: true,
            });
          }
        } else {
          task = await WorkerManage.getTaskByIdRollbackBuild(conversationId, {
            yoloMode: true,
          });
        }
      } catch (err) {
        hook.state.lastStatus = 'error';
        hook.state.lastError = err instanceof Error ? err.message : 'Conversation not found';
        hookStore.update(hook.id, { state: hook.state });
        const updatedHook = hookStore.getById(hook.id);
        if (updatedHook) {
          ipcBridge.hooks.onHookTriggered.emit({ hookId: hook.id, status: 'error', error: hook.state.lastError });
          ipcBridge.hooks.onHookUpdated.emit(updatedHook);
        }
        return;
      }

      if (!task) {
        hook.state.lastStatus = 'error';
        hook.state.lastError = 'Conversation not found';
        hookStore.update(hook.id, { state: hook.state });
        const updatedHook = hookStore.getById(hook.id);
        if (updatedHook) {
          ipcBridge.hooks.onHookTriggered.emit({ hookId: hook.id, status: 'error', error: hook.state.lastError });
          ipcBridge.hooks.onHookUpdated.emit(updatedHook);
        }
        return;
      }

      // Get workspace from task
      const workspace = (task as { workspace?: string }).workspace;
      const workspaceFiles = workspace ? await copyFilesToDirectory(workspace, [], false) : [];

      // Build cronMeta for message origin tracking (reuse cron meta structure)
      const cronMeta: CronMessageMeta = {
        source: 'cron',
        cronJobId: hook.id,
        cronJobName: `[Hook] ${hook.name}`,
        triggeredAt: Date.now(),
      };

      // Send message to conversation
      if (task.type === 'codex' || task.type === 'acp') {
        await task.sendMessage({ content: messageText, msg_id: msgId, files: workspaceFiles, cronMeta });
      } else {
        await task.sendMessage({ input: messageText, msg_id: msgId, files: workspaceFiles, cronMeta });
      }

      // Success
      hook.state.lastStatus = 'ok';
      hook.state.lastError = undefined;

      // Update conversation modifyTime
      try {
        const db = getDatabase();
        db.updateConversation(conversationId, {});
      } catch (err) {
        console.warn('[HookService] Failed to update conversation modifyTime after execution:', err);
      }
    } catch (error) {
      hook.state.lastStatus = 'error';
      hook.state.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[HookService] Hook ${hook.id} failed:`, error);
    }

    // Persist state and notify frontend
    hookStore.update(hook.id, { state: hook.state });
    const updatedHook = hookStore.getById(hook.id);
    if (updatedHook) {
      ipcBridge.hooks.onHookTriggered.emit({ hookId: hook.id, status: hook.state.lastStatus || 'ok' });
      ipcBridge.hooks.onHookUpdated.emit(updatedHook);
    }
  }

  /**
   * Restart the webhook server with new host/port
   */
  async restartWebhookServer(host?: string, port?: number): Promise<{ port: number }> {
    webhookHandler.cleanup();
    // Re-set triggerFn (may be lost after HMR module reload)
    webhookHandler.setTriggerFn(this.triggerHook.bind(this));
    await webhookHandler.startServer(port, host);
    // Re-register all webhook hooks
    const webhookHooks = hookStore.listEnabledByKind('webhook');
    for (const hook of webhookHooks) {
      webhookHandler.register(hook);
    }
    return { port: webhookHandler.port };
  }

  /**
   * Cleanup - stop all hooks
   */
  cleanup(): void {
    webhookHandler.cleanup();
    rssHandler.cleanup();
    fileHandler.cleanup();
    this.initialized = false;
  }
}

// Singleton instance
export const hookService = new HookService();

// Re-export types
export type { HookJob, HookKind, HookConfig } from './HookStore';
