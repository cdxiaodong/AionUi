/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useLocationMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());
const setSelectedAgentKeyMock = vi.hoisted(() => vi.fn());
const setInputMock = vi.hoisted(() => vi.fn());
const configGetMock = vi.hoisted(() => vi.fn());
const configSetMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => useLocationMock(),
  useNavigate: () => useNavigateMock,
}));

vi.mock('@/common/utils', () => ({
  resolveLocaleKey: (value: string) => value,
}));

vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantBackends: () => ({ availableBackends: [], extensionAcpAdapters: [] }),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'rgb(1, 2, 3)',
    inactiveBorderColor: 'rgb(4, 5, 6)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
  resolveExtensionAssetUrl: (value: string) => value,
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    closeAllTabs: vi.fn(),
    openTab: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/constants', () => ({
  BUILTIN_AGENT_OPTIONS: [],
  CUSTOM_AVATAR_IMAGE_MAP: {},
}));

vi.mock('../../../src/renderer/pages/guid/components/AgentPillBar', () => ({
  default: () => <div data-testid='agent-pill-bar' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/AssistantSelectionArea', () => ({
  default: () => <div data-testid='assistant-selection-area' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/GuidSkeleton', () => ({
  AgentPillBarSkeleton: () => <div data-testid='agent-pill-bar-skeleton' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/GuidActionRow', () => ({
  default: () => <div data-testid='guid-action-row' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/GuidInputCard', () => ({
  default: ({ actionRow }: { actionRow?: React.ReactNode }) => <div data-testid='guid-input-card'>{actionRow}</div>,
}));

vi.mock('../../../src/renderer/pages/guid/components/GuidModelSelector', () => ({
  default: () => <div data-testid='guid-model-selector' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/MentionDropdown', () => ({
  default: () => <div data-testid='mention-dropdown' />,
  MentionSelectorBadge: () => <div data-testid='mention-selector-badge' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/QuickActionButtons', () => ({
  default: () => <div data-testid='quick-action-buttons' />,
}));

vi.mock('../../../src/renderer/pages/guid/components/SkillsMarketBanner', () => ({
  default: () => <div data-testid='skills-market-banner' />,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => null,
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useGuidAgentSelection', () => ({
  useGuidAgentSelection: () => ({
    availableAgents: [{ backend: 'custom', name: 'Preset Agent', customAgentId: 'preset-agent', isPreset: true }],
    cachedConfigOptions: [],
    currentAcpCachedModelInfo: null,
    currentEffectiveAgentInfo: { agentType: 'claude' },
    customAgentAvatarMap: {},
    customAgents: [],
    defaultAgentKey: 'claude',
    findAgentByKey: vi.fn(),
    getAgentKey: vi.fn(() => 'claude'),
    getAvailableFallbackAgent: vi.fn(),
    getEffectiveAgentType: vi.fn(() => 'claude'),
    isMainAgentAvailable: true,
    isPresetAgent: true,
    pendingConfigOptions: {},
    refreshCustomAgents: vi.fn(),
    resolveEnabledSkills: vi.fn(() => []),
    resolvePresetRulesAndSkills: vi.fn(),
    selectedAcpModel: null,
    selectedAgent: 'custom',
    selectedAgentInfo: { backend: 'custom', name: 'Preset Agent', customAgentId: 'preset-agent', isPreset: true },
    selectedAgentKey: 'custom:preset-agent',
    selectedMode: 'default',
    setPendingConfigOption: vi.fn(),
    setSelectedAcpModel: vi.fn(),
    setSelectedAgentKey: setSelectedAgentKeyMock,
    setSelectedMode: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useGuidInput', () => ({
  useGuidInput: () => ({
    dir: '',
    dragHandlers: {},
    files: [],
    handleFilesUploaded: vi.fn(),
    handleRemoveFile: vi.fn(),
    handleTextareaBlur: vi.fn(),
    handleTextareaFocus: vi.fn(),
    input: '',
    isFileDragging: false,
    isInputFocused: false,
    loading: false,
    onPaste: vi.fn(),
    setDir: vi.fn(),
    setFiles: vi.fn(),
    setInput: setInputMock,
    setLoading: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useGuidMention', () => ({
  useGuidMention: () => ({
    filteredMentionOptions: [],
    mentionActiveIndex: 0,
    mentionMatchRegex: /$^/,
    mentionMenuRef: { current: null },
    mentionMenuSelectedKey: null,
    mentionOpen: false,
    mentionQuery: null,
    mentionSelectorOpen: false,
    mentionSelectorVisible: false,
    selectMentionAgent: vi.fn(),
    selectedAgentLabel: 'Preset Agent',
    setMentionActiveIndex: vi.fn(),
    setMentionOpen: vi.fn(),
    setMentionQuery: vi.fn(),
    setMentionSelectorOpen: vi.fn(),
    setMentionSelectorVisible: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useGuidModelSelection', () => ({
  useGuidModelSelection: () => ({
    currentModel: null,
    geminiModeLookup: {},
    isGoogleAuth: false,
    modelList: [],
    setCurrentModel: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useGuidSend', () => ({
  useGuidSend: () => ({
    handleSend: vi.fn(),
    isButtonDisabled: false,
    sendMessageHandler: vi.fn(),
  }),
}));

vi.mock('../../../src/renderer/pages/guid/hooks/useTypewriterPlaceholder', () => ({
  useTypewriterPlaceholder: () => 'placeholder',
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: configGetMock,
    set: configSetMock,
  },
}));

vi.mock('@/common/types/acpTypes', () => ({
  ACP_BACKENDS_ALL: [],
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  ConfigProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Menu: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  }),
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span />,
  Left: () => <span />,
  Robot: () => <span />,
  Write: () => <span />,
}));

import GuidPage from '../../../src/renderer/pages/guid/GuidPage';

describe('GuidPage', () => {
  beforeEach(() => {
    useNavigateMock.mockReset();
    useLocationMock.mockReset();
    setSelectedAgentKeyMock.mockReset();
    setInputMock.mockReset();
    configGetMock.mockReset();
    configSetMock.mockReset();
    configGetMock.mockResolvedValue(undefined);
    configSetMock.mockResolvedValue(undefined);
    useLocationMock.mockReturnValue({
      key: 'guid-reset-key',
      pathname: '/guid',
      search: '',
      hash: '',
      state: { resetAssistant: true },
    });
  });

  it('resets the preset assistant before painting a fresh guid session', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(<GuidPage />);

    expect(setInputMock).toHaveBeenCalledWith('');
    expect(setSelectedAgentKeyMock).toHaveBeenCalledWith('claude');
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/guid');
  });

  it('keeps the selected assistant when no reset was requested', () => {
    useLocationMock.mockReturnValue({
      key: 'guid-normal-key',
      pathname: '/guid',
      search: '',
      hash: '',
      state: null,
    });

    render(<GuidPage />);

    expect(setInputMock).toHaveBeenCalledWith('');
    expect(setSelectedAgentKeyMock).not.toHaveBeenCalled();
  });
});
