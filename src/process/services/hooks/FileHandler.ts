/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import type { HookJob } from './HookStore';

/**
 * FileHandler - Manages file/directory watching
 *
 * Uses Node.js fs.watch to monitor file system changes
 * and triggers hooks when matching events occur.
 */
export class FileHandler {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private triggerFn: ((hook: HookJob, payload: string) => Promise<void>) | null = null;
  // Debounce map to prevent duplicate triggers
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Set trigger function
   */
  setTriggerFn(triggerFn: (hook: HookJob, payload: string) => Promise<void>): void {
    this.triggerFn = triggerFn;
  }

  /**
   * Start watching a file or directory
   */
  startWatching(hook: HookJob): void {
    if (hook.config.kind !== 'file') return;
    // Stop existing watcher if any
    this.stopWatching(hook.id);

    const { watchPath, events } = hook.config;

    try {
      const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        // Map fs.watch event types to our event types
        // 'rename' covers both create and delete
        // 'change' covers content modification
        const mappedEvents: Array<'create' | 'change' | 'delete'> = [];
        if (eventType === 'rename') {
          mappedEvents.push('create', 'delete');
        } else if (eventType === 'change') {
          mappedEvents.push('change');
        }

        // Check if any mapped event matches the configured events
        const hasMatch = mappedEvents.some((e) => events.includes(e));
        if (!hasMatch || !this.triggerFn) return;

        // Debounce: avoid rapid-fire triggers for the same file
        const debounceKey = `${hook.id}:${filename}`;
        const existingTimer = this.debounceTimers.get(debounceKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          this.debounceTimers.delete(debounceKey);

          const payload = JSON.stringify({
            eventType,
            filename,
            watchPath,
            timestamp: Date.now(),
          });

          void this.triggerFn!(hook, payload);
        }, 500); // 500ms debounce

        this.debounceTimers.set(debounceKey, timer);
      });

      watcher.on('error', (err) => {
        console.error(`[FileHandler] Watcher error for hook ${hook.id}:`, err);
      });

      this.watchers.set(hook.id, watcher);
      console.log(`[FileHandler] Started watching: ${hook.id} -> ${watchPath}`);
    } catch (err) {
      console.error(`[FileHandler] Failed to start watching for hook ${hook.id}:`, err);
    }
  }

  /**
   * Stop watching for a hook
   */
  stopWatching(hookId: string): void {
    const watcher = this.watchers.get(hookId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(hookId);
      console.log(`[FileHandler] Stopped watching: ${hookId}`);
    }

    // Clear any pending debounce timers for this hook
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(`${hookId}:`)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  /**
   * Cleanup all watchers
   */
  cleanup(): void {
    for (const [hookId] of this.watchers) {
      this.stopWatching(hookId);
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

export const fileHandler = new FileHandler();
