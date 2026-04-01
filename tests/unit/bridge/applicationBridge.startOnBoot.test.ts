/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatform = process.platform;

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
};

describe('applicationBridge start-on-boot helpers', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('electron');
  });

  const mockBridgeDependencies = (): void => {
    vi.doMock('@/common', () => ({
      ipcBridge: {
        application: {
          restart: { provider: vi.fn() },
          isDevToolsOpened: { provider: vi.fn() },
          openDevTools: { provider: vi.fn() },
          getZoomFactor: { provider: vi.fn() },
          setZoomFactor: { provider: vi.fn() },
          getCdpStatus: { provider: vi.fn() },
          updateCdpConfig: { provider: vi.fn() },
          getStartOnBootStatus: { provider: vi.fn() },
          setStartOnBoot: { provider: vi.fn() },
        },
      },
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: {
        get: vi.fn(),
        set: vi.fn(),
      },
    }));

    vi.doMock('@process/utils/zoom', () => ({
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn((factor: number) => factor),
    }));

    vi.doMock('@process/utils/configureChromium', () => ({
      getCdpStatus: vi.fn(() => ({
        enabled: false,
        port: null,
        startupEnabled: false,
        instances: [],
        configEnabled: false,
        isDevMode: false,
      })),
      updateCdpConfig: vi.fn(),
    }));

    vi.doMock('@process/bridge/applicationBridgeCore', () => ({
      initApplicationBridgeCore: vi.fn(),
    }));
  };

  it('reports the packaged macOS login-item state', async () => {
    setPlatform('darwin');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({ openAtLogin: true })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { getStartOnBootStatus } = await import('@process/bridge/applicationBridge');

    expect(getStartOnBootStatus()).toEqual({
      supported: true,
      enabled: true,
      isPackaged: true,
      platform: 'darwin',
    });
  });

  it('detects login launches on packaged macOS', async () => {
    setPlatform('darwin');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({
          openAtLogin: true,
          wasOpenedAtLogin: true,
        })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { wasLaunchedAtLogin } = await import('@process/bridge/applicationBridge');

    expect(wasLaunchedAtLogin()).toBe(true);
  });

  it('updates Windows start-on-boot via login item settings', async () => {
    setPlatform('win32');
    mockBridgeDependencies();

    let openAtLogin = false;
    const setLoginItemSettings = vi.fn(({ openAtLogin: nextValue }: { openAtLogin: boolean }) => {
      openAtLogin = nextValue;
    });

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({
          openAtLogin,
          executableWillLaunchAtLogin: openAtLogin,
        })),
        setLoginItemSettings,
      },
    }));

    const { START_ON_BOOT_WINDOWS_ARG, setStartOnBootEnabled } = await import('@process/bridge/applicationBridge');
    const status = setStartOnBootEnabled(true);

    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [START_ON_BOOT_WINDOWS_ARG],
      enabled: true,
    });
    expect(status).toEqual({
      supported: true,
      enabled: true,
      isPackaged: true,
      platform: 'win32',
    });
  });

  it('detects login launches on packaged Windows via startup argument', async () => {
    setPlatform('win32');
    mockBridgeDependencies();

    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--start-on-boot'];

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(() => ({
          openAtLogin: true,
          executableWillLaunchAtLogin: true,
        })),
        setLoginItemSettings: vi.fn(),
      },
    }));

    try {
      const { wasLaunchedAtLogin } = await import('@process/bridge/applicationBridge');

      expect(wasLaunchedAtLogin()).toBe(true);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('returns unsupported status on non-desktop-login platforms', async () => {
    setPlatform('linux');
    mockBridgeDependencies();

    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getLoginItemSettings: vi.fn(),
        setLoginItemSettings: vi.fn(),
      },
    }));

    const { getStartOnBootStatus } = await import('@process/bridge/applicationBridge');

    expect(getStartOnBootStatus()).toEqual({
      supported: false,
      enabled: false,
      isPackaged: true,
      platform: 'linux',
    });
  });
});
