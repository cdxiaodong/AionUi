/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 系统设置桥接模块
 * System Settings Bridge Module
 *
 * 负责处理系统级设置的读写操作（如关闭到托盘）
 * Handles read/write operations for system-level settings (e.g. close to tray)
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';

type CloseToTrayChangeListener = (enabled: boolean) => void;
let _changeListener: CloseToTrayChangeListener | null = null;

/**
 * 注册关闭到托盘设置变更监听器（供主进程 index.ts 使用）
 * Register a listener for close-to-tray setting changes (used by main process index.ts)
 */
export function onCloseToTrayChanged(listener: CloseToTrayChangeListener): void {
  _changeListener = listener;
}

export function initSystemSettingsBridge(): void {
  // 获取"关闭到托盘"设置 / Get "close to tray" setting
  ipcBridge.systemSettings.getCloseToTray.provider(async () => {
    const value = await ConfigStorage.get('system.closeToTray');
    return value ?? false;
  });

  // 设置"关闭到托盘" / Set "close to tray" setting
  ipcBridge.systemSettings.setCloseToTray.provider(async ({ enabled }) => {
    await ConfigStorage.set('system.closeToTray', enabled);
    _changeListener?.(enabled);
  });
}
