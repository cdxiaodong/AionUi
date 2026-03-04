/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/database';
import type { AcpBackendAll } from '@/types/acpTypes';

/**
 * Hook kind types
 */
export type HookKind = 'webhook' | 'rss' | 'file';

/**
 * Hook config types (discriminated union)
 */
export type HookConfig =
  | { kind: 'webhook'; path: string; secret?: string }
  | { kind: 'rss'; feedUrl: string; pollIntervalMs: number }
  | { kind: 'file'; watchPath: string; events: ('create' | 'change' | 'delete')[] };

/**
 * Hook job definition
 */
export interface HookJob {
  id: string;
  name: string;
  kind: HookKind;
  enabled: boolean;
  config: HookConfig;
  message: string;
  metadata: {
    conversationId: string;
    conversationTitle?: string;
    agentType: AcpBackendAll;
    createdBy: 'user' | 'agent';
    createdAt: number;
    updatedAt: number;
  };
  state: {
    lastTriggeredAt?: number;
    lastStatus?: 'ok' | 'error' | 'skipped';
    lastError?: string;
    triggerCount: number;
    lastFeedItemId?: string;
  };
}

/**
 * Database row structure for hooks table
 */
interface HookRow {
  id: string;
  name: string;
  kind: string;
  enabled: number;
  config: string;
  message: string;
  conversation_id: string;
  conversation_title: string | null;
  agent_type: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  last_triggered_at: number | null;
  last_status: string | null;
  last_error: string | null;
  trigger_count: number;
  last_feed_item_id: string | null;
}

/**
 * Convert HookJob to database row
 */
function hookToRow(hook: HookJob): HookRow {
  return {
    id: hook.id,
    name: hook.name,
    kind: hook.kind,
    enabled: hook.enabled ? 1 : 0,
    config: JSON.stringify(hook.config),
    message: hook.message,
    conversation_id: hook.metadata.conversationId,
    conversation_title: hook.metadata.conversationTitle ?? null,
    agent_type: hook.metadata.agentType,
    created_by: hook.metadata.createdBy,
    created_at: hook.metadata.createdAt,
    updated_at: hook.metadata.updatedAt,
    last_triggered_at: hook.state.lastTriggeredAt ?? null,
    last_status: hook.state.lastStatus ?? null,
    last_error: hook.state.lastError ?? null,
    trigger_count: hook.state.triggerCount,
    last_feed_item_id: hook.state.lastFeedItemId ?? null,
  };
}

/**
 * Convert database row to HookJob
 */
function rowToHook(row: HookRow): HookJob {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as HookKind,
    enabled: row.enabled === 1,
    config: JSON.parse(row.config) as HookConfig,
    message: row.message,
    metadata: {
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title ?? undefined,
      agentType: row.agent_type as AcpBackendAll,
      createdBy: row.created_by as 'user' | 'agent',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    state: {
      lastTriggeredAt: row.last_triggered_at ?? undefined,
      lastStatus: row.last_status as 'ok' | 'error' | 'skipped' | undefined,
      lastError: row.last_error ?? undefined,
      triggerCount: row.trigger_count,
      lastFeedItemId: row.last_feed_item_id ?? undefined,
    },
  };
}

/**
 * HookStore - Persistence layer for event hooks
 */
class HookStore {
  /**
   * Insert a new hook
   */
  insert(hook: HookJob): void {
    const db = getDatabase();
    const row = hookToRow(hook);

    // @ts-expect-error - db is private but we need direct access
    db.db
      .prepare(
        `
      INSERT INTO hooks (
        id, name, kind, enabled, config, message,
        conversation_id, conversation_title, agent_type, created_by,
        created_at, updated_at,
        last_triggered_at, last_status, last_error, trigger_count, last_feed_item_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        row.id, row.name, row.kind, row.enabled, row.config, row.message,
        row.conversation_id, row.conversation_title, row.agent_type, row.created_by,
        row.created_at, row.updated_at,
        row.last_triggered_at, row.last_status, row.last_error, row.trigger_count, row.last_feed_item_id
      );
  }

  /**
   * Update an existing hook
   */
  update(hookId: string, updates: Partial<HookJob>): void {
    const existing = this.getById(hookId);
    if (!existing) {
      throw new Error(`Hook not found: ${hookId}`);
    }

    const updated: HookJob = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: Date.now(),
      },
      state: {
        ...existing.state,
        ...updates.state,
      },
    };

    if (updates.config) {
      updated.config = updates.config;
    }

    const row = hookToRow(updated);
    const db = getDatabase();

    // @ts-expect-error - db is private but we need direct access
    db.db
      .prepare(
        `
      UPDATE hooks SET
        name = ?, kind = ?, enabled = ?, config = ?, message = ?,
        conversation_title = ?, updated_at = ?,
        last_triggered_at = ?, last_status = ?, last_error = ?,
        trigger_count = ?, last_feed_item_id = ?
      WHERE id = ?
    `
      )
      .run(
        row.name, row.kind, row.enabled, row.config, row.message,
        row.conversation_title, row.updated_at,
        row.last_triggered_at, row.last_status, row.last_error,
        row.trigger_count, row.last_feed_item_id,
        hookId
      );
  }

  /**
   * Delete a hook
   */
  delete(hookId: string): void {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    db.db.prepare('DELETE FROM hooks WHERE id = ?').run(hookId);
  }

  /**
   * Get a hook by ID
   */
  getById(hookId: string): HookJob | null {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const row = db.db.prepare('SELECT * FROM hooks WHERE id = ?').get(hookId) as HookRow | undefined;
    return row ? rowToHook(row) : null;
  }

  /**
   * List all hooks
   */
  listAll(): HookJob[] {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const rows = db.db.prepare('SELECT * FROM hooks ORDER BY created_at DESC').all() as HookRow[];
    return rows.map(rowToHook);
  }

  /**
   * List hooks by conversation ID
   */
  listByConversation(conversationId: string): HookJob[] {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const rows = db.db.prepare('SELECT * FROM hooks WHERE conversation_id = ? ORDER BY created_at DESC').all(conversationId) as HookRow[];
    return rows.map(rowToHook);
  }

  /**
   * List all enabled hooks
   */
  listEnabled(): HookJob[] {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const rows = db.db.prepare('SELECT * FROM hooks WHERE enabled = 1 ORDER BY created_at ASC').all() as HookRow[];
    return rows.map(rowToHook);
  }

  /**
   * List enabled hooks by kind
   */
  listEnabledByKind(kind: HookKind): HookJob[] {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const rows = db.db.prepare('SELECT * FROM hooks WHERE enabled = 1 AND kind = ? ORDER BY created_at ASC').all(kind) as HookRow[];
    return rows.map(rowToHook);
  }

  /**
   * Delete all hooks for a conversation
   */
  deleteByConversation(conversationId: string): number {
    const db = getDatabase();
    // @ts-expect-error - db is private but we need direct access
    const result = db.db.prepare('DELETE FROM hooks WHERE conversation_id = ?').run(conversationId);
    return result.changes;
  }
}

// Singleton instance
export const hookStore = new HookStore();
