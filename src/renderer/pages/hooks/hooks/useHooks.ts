/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IHookJob } from '@/common/ipcBridge';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Common hook actions
 */
interface HookActionsResult {
  pauseHook: (hookId: string) => Promise<void>;
  resumeHook: (hookId: string) => Promise<void>;
  deleteHook: (hookId: string) => Promise<void>;
  updateHook: (hookId: string, updates: Partial<IHookJob>) => Promise<IHookJob>;
}

/**
 * Creates common hook action handlers
 */
function useHookActions(onHookUpdated?: (hookId: string, hook: IHookJob) => void, onHookDeleted?: (hookId: string) => void): HookActionsResult {
  const pauseHook = useCallback(
    async (hookId: string) => {
      const updated = await ipcBridge.hooks.updateHook.invoke({ hookId, updates: { enabled: false } });
      onHookUpdated?.(hookId, updated);
    },
    [onHookUpdated]
  );

  const resumeHook = useCallback(
    async (hookId: string) => {
      const updated = await ipcBridge.hooks.updateHook.invoke({ hookId, updates: { enabled: true } });
      onHookUpdated?.(hookId, updated);
    },
    [onHookUpdated]
  );

  const deleteHook = useCallback(
    async (hookId: string) => {
      await ipcBridge.hooks.removeHook.invoke({ hookId });
      onHookDeleted?.(hookId);
    },
    [onHookDeleted]
  );

  const updateHook = useCallback(
    async (hookId: string, updates: Partial<IHookJob>) => {
      const updated = await ipcBridge.hooks.updateHook.invoke({ hookId, updates });
      onHookUpdated?.(hookId, updated);
      return updated;
    },
    [onHookUpdated]
  );

  return { pauseHook, resumeHook, deleteHook, updateHook };
}

/**
 * Event handlers for hook subscription
 */
interface HookEventHandlers {
  onHookCreated: (hook: IHookJob) => void;
  onHookUpdated: (hook: IHookJob) => void;
  onHookRemoved: (data: { hookId: string }) => void;
}

/**
 * Subscribe to hook events with unified cleanup
 */
function useHookSubscription(handlers: HookEventHandlers) {
  useEffect(() => {
    const unsubCreate = ipcBridge.hooks.onHookCreated.on(handlers.onHookCreated);
    const unsubUpdate = ipcBridge.hooks.onHookUpdated.on(handlers.onHookUpdated);
    const unsubRemove = ipcBridge.hooks.onHookRemoved.on(handlers.onHookRemoved);

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubRemove();
    };
  }, [handlers.onHookCreated, handlers.onHookUpdated, handlers.onHookRemoved]);
}

/**
 * Hook for managing hooks for a specific conversation
 * Unlike cron (1 per conversation), multiple hooks can exist per conversation
 */
export function useHooks(conversationId?: string) {
  const [hooks, setHooks] = useState<IHookJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch hooks for the conversation
  const fetchHooks = useCallback(async () => {
    if (!conversationId) {
      setHooks([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await ipcBridge.hooks.listHooksByConversation.invoke({ conversationId });
      setHooks(result || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch hooks'));
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Initial fetch
  useEffect(() => {
    void fetchHooks();
  }, [fetchHooks]);

  // Event handlers
  const eventHandlers = useMemo<HookEventHandlers>(
    () => ({
      onHookCreated: (hook: IHookJob) => {
        if (hook.metadata.conversationId === conversationId) {
          setHooks((prev) => (prev.some((h) => h.id === hook.id) ? prev : [...prev, hook]));
        }
      },
      onHookUpdated: (hook: IHookJob) => {
        if (hook.metadata.conversationId === conversationId) {
          setHooks((prev) => prev.map((h) => (h.id === hook.id ? hook : h)));
        }
      },
      onHookRemoved: ({ hookId }: { hookId: string }) => {
        setHooks((prev) => prev.filter((h) => h.id !== hookId));
      },
    }),
    [conversationId]
  );

  useHookSubscription(eventHandlers);

  const actions = useHookActions();

  // Computed values
  const hasHooks = hooks.length > 0;
  const activeHooksCount = hooks.filter((h) => h.enabled).length;
  const hasError = hooks.some((h) => h.state.lastStatus === 'error');

  return {
    hooks,
    loading,
    error,
    hasHooks,
    activeHooksCount,
    hasError,
    refetch: fetchHooks,
    ...actions,
  };
}

/**
 * Hook for getting hook status for all conversations
 * Used by ChatHistory to show indicators
 */
export function useHooksMap() {
  const [hooksMap, setHooksMap] = useState<Map<string, IHookJob[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('aionui_hooks_unread');
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    return new Set();
  });
  const lastTriggeredAtMapRef = useRef<Map<string, number>>(new Map());
  const activeConversationIdRef = useRef<string | null>(null);

  // Persist unread state
  useEffect(() => {
    try {
      localStorage.setItem('aionui_hooks_unread', JSON.stringify([...unreadConversations]));
    } catch {
      // ignore
    }
  }, [unreadConversations]);

  // Fetch all hooks and group by conversation
  const fetchAllHooks = useCallback(async () => {
    setLoading(true);
    try {
      const allHooks = await ipcBridge.hooks.listHooks.invoke();
      const map = new Map<string, IHookJob[]>();

      for (const hook of allHooks || []) {
        const convId = hook.metadata.conversationId;
        if (!map.has(convId)) {
          map.set(convId, []);
        }
        map.get(convId)!.push(hook);
        if (hook.state.lastTriggeredAt) {
          lastTriggeredAtMapRef.current.set(hook.id, hook.state.lastTriggeredAt);
        }
      }

      setHooksMap(map);
    } catch (err) {
      console.error('[useHooksMap] Failed to fetch hooks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchAllHooks();
  }, [fetchAllHooks]);

  // Event handlers
  const eventHandlers = useMemo<HookEventHandlers>(
    () => ({
      onHookCreated: (hook: IHookJob) => {
        setHooksMap((prev) => {
          const convId = hook.metadata.conversationId;
          const existing = prev.get(convId) || [];
          if (existing.some((h) => h.id === hook.id)) return prev;
          const newMap = new Map(prev);
          newMap.set(convId, [...existing, hook]);
          return newMap;
        });
        emitter.emit('chat.history.refresh');
      },
      onHookUpdated: (hook: IHookJob) => {
        const convId = hook.metadata.conversationId;

        // Check if this is a new trigger
        const prevLastTriggered = lastTriggeredAtMapRef.current.get(hook.id);
        const newLastTriggered = hook.state.lastTriggeredAt;
        if (newLastTriggered && newLastTriggered !== prevLastTriggered) {
          lastTriggeredAtMapRef.current.set(hook.id, newLastTriggered);
          if (activeConversationIdRef.current !== convId) {
            setUnreadConversations((prev) => {
              if (prev.has(convId)) return prev;
              const newSet = new Set(prev);
              newSet.add(convId);
              return newSet;
            });
          }
          emitter.emit('chat.history.refresh');
        }

        setHooksMap((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(convId) || [];
          newMap.set(
            convId,
            existing.map((h) => (h.id === hook.id ? hook : h))
          );
          return newMap;
        });
      },
      onHookRemoved: ({ hookId }: { hookId: string }) => {
        setHooksMap((prev) => {
          const newMap = new Map(prev);
          for (const [convId, convHooks] of newMap.entries()) {
            const filtered = convHooks.filter((h) => h.id !== hookId);
            if (filtered.length === 0) {
              newMap.delete(convId);
            } else if (filtered.length !== convHooks.length) {
              newMap.set(convId, filtered);
            }
          }
          return newMap;
        });
      },
    }),
    []
  );

  useEffect(() => {
    const unsubCreate = ipcBridge.hooks.onHookCreated.on(eventHandlers.onHookCreated);
    const unsubUpdate = ipcBridge.hooks.onHookUpdated.on(eventHandlers.onHookUpdated);
    const unsubRemove = ipcBridge.hooks.onHookRemoved.on(eventHandlers.onHookRemoved);

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubRemove();
    };
  }, [eventHandlers]);

  const hasHooksForConversation = useCallback(
    (conversationId: string) => {
      return hooksMap.has(conversationId) && hooksMap.get(conversationId)!.length > 0;
    },
    [hooksMap]
  );

  const getHooksForConversation = useCallback(
    (conversationId: string): IHookJob[] => {
      return hooksMap.get(conversationId) || [];
    },
    [hooksMap]
  );

  const getHookStatus = useCallback(
    (conversationId: string): 'none' | 'active' | 'paused' | 'error' | 'unread' => {
      const convHooks = hooksMap.get(conversationId);
      if (!convHooks || convHooks.length === 0) return 'none';
      if (unreadConversations.has(conversationId)) return 'unread';
      if (convHooks.some((h) => h.state.lastStatus === 'error')) return 'error';
      if (convHooks.every((h) => !h.enabled)) return 'paused';
      return 'active';
    },
    [hooksMap, unreadConversations]
  );

  const markAsRead = useCallback((conversationId: string) => {
    activeConversationIdRef.current = conversationId;
    setUnreadConversations((prev) => {
      if (!prev.has(conversationId)) return prev;
      const newSet = new Set(prev);
      newSet.delete(conversationId);
      return newSet;
    });
  }, []);

  const hasUnread = useCallback(
    (conversationId: string) => {
      return unreadConversations.has(conversationId);
    },
    [unreadConversations]
  );

  return useMemo(
    () => ({
      hooksMap,
      loading,
      hasHooksForConversation,
      getHooksForConversation,
      getHookStatus,
      markAsRead,
      hasUnread,
      refetch: fetchAllHooks,
    }),
    [hooksMap, loading, hasHooksForConversation, getHooksForConversation, getHookStatus, markAsRead, hasUnread, fetchAllHooks]
  );
}

export default useHooks;
