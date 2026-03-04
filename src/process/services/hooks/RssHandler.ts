/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import RssParser from 'rss-parser';
import type { HookJob } from './HookStore';
import { hookStore } from './HookStore';

/**
 * RssHandler - Manages RSS/Atom feed polling
 *
 * Polls RSS feeds at configurable intervals and triggers hooks
 * when new items are detected.
 */
export class RssHandler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private parser = new RssParser();
  private triggerFn: ((hook: HookJob, payload: string) => Promise<void>) | null = null;

  /**
   * Set trigger function
   */
  setTriggerFn(triggerFn: (hook: HookJob, payload: string) => Promise<void>): void {
    this.triggerFn = triggerFn;
  }

  /**
   * Start polling an RSS feed
   */
  startPolling(hook: HookJob): void {
    if (hook.config.kind !== 'rss') return;
    // Stop existing timer if any
    this.stopPolling(hook.id);

    const { feedUrl, pollIntervalMs } = hook.config;

    const poll = async () => {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const items = feed.items || [];
        if (items.length === 0) return;

        // Get current hook state from store (may have been updated)
        const currentHook = hookStore.getById(hook.id);
        if (!currentHook || !currentHook.enabled) return;

        const lastSeen = currentHook.state.lastFeedItemId;
        let newItems: typeof items;

        if (lastSeen) {
          // Find new items since last seen
          const lastIndex = items.findIndex((i) => (i.guid || i.link) === lastSeen);
          newItems = lastIndex === -1 ? items.slice(0, 1) : items.slice(0, lastIndex);
        } else {
          // First poll after init, take only latest
          newItems = items.slice(0, 1);
        }

        if (newItems.length > 0 && this.triggerFn) {
          // Update lastFeedItemId
          const newLastId = newItems[0].guid || newItems[0].link;
          if (newLastId) {
            hookStore.update(currentHook.id, {
              state: { ...currentHook.state, lastFeedItemId: newLastId },
            });
          }

          // Build payload
          const payload = newItems.map((item) => ({
            title: item.title,
            link: item.link,
            content: item.contentSnippet || item.content,
            pubDate: item.pubDate,
          }));

          await this.triggerFn(currentHook, JSON.stringify(payload));
        }
      } catch (err) {
        console.warn(`[RssHandler] Poll failed for hook ${hook.id}:`, err);
      }
    };

    // Initialize feed (record lastFeedItemId without triggering)
    void this.initFeed(hook);

    // Start periodic polling
    const timer = setInterval(() => void poll(), pollIntervalMs);
    this.timers.set(hook.id, timer);
    console.log(`[RssHandler] Started polling: ${hook.id} (every ${pollIntervalMs}ms)`);
  }

  /**
   * Stop polling for a hook
   */
  stopPolling(hookId: string): void {
    const timer = this.timers.get(hookId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(hookId);
      console.log(`[RssHandler] Stopped polling: ${hookId}`);
    }
  }

  /**
   * Initialize feed - record latest item ID without triggering
   */
  private async initFeed(hook: HookJob): Promise<void> {
    if (hook.config.kind !== 'rss') return;
    if (hook.state.lastFeedItemId) return; // Already has a record

    try {
      const feed = await this.parser.parseURL(hook.config.feedUrl);
      const first = feed.items?.[0];
      if (first) {
        const itemId = first.guid || first.link;
        if (itemId) {
          hookStore.update(hook.id, {
            state: { ...hook.state, lastFeedItemId: itemId },
          });
        }
      }
    } catch (err) {
      console.warn(`[RssHandler] Failed to init feed for ${hook.id}:`, err);
    }
  }

  /**
   * Cleanup all timers
   */
  cleanup(): void {
    for (const [hookId] of this.timers) {
      this.stopPolling(hookId);
    }
    this.timers.clear();
  }
}

export const rssHandler = new RssHandler();
